import { BehaviorSubject, Observable, of } from 'rxjs';
import { debounceTime, switchMap, tap, filter, catchError } from 'rxjs/operators';
import { HttpSetup } from 'opensearch-dashboards/public';

const topN = (ppl: string, n: number) => `${ppl} | head ${n}`;

const createPrompt = (input: string, ppl: string, sample: any) => {
  return `
Your task is to generate Vega-Lite chart specifications based on the given data, the data schema, the PPL query to get the data and the user's instruction

The data is represented in json format:
${JSON.stringify(sample.jsonData, null, 4)}

This is the schema of the data:
${JSON.stringify(sample.schema, null, 4)}

The PPL query to get the json data is:
${ppl}

The user's instruction is: ${input}

If mark.type = point and shape.field is a field of the data, the definition of the shape should be inside the root "encoding" object, NOT in the "mark" object, for example, {"encoding": {"shape": {"field": "field_name"}}}

Just return the chart specification json based on Vega-Lite format
Just reply with the json based Vega-Lite object, do not include any other content in the reply
`;
};

export class Text2Vega {
  input$ = new BehaviorSubject({ prompt: '', index: '' });
  result$: Observable<Record<string, any> | { error: any }>;
  status$ = new BehaviorSubject<'RUNNING' | 'STOPPED'>('STOPPED');
  http: HttpSetup;

  constructor(http: HttpSetup) {
    this.http = http;
    this.result$ = this.input$
      .pipe(
        filter((v) => v.prompt.length > 0),
        debounceTime(200),
        tap(() => this.status$.next('RUNNING'))
      )
      .pipe(
        switchMap((v) =>
          of(v).pipe(
            // text to ppl
            switchMap(async (value) => {
              const pplQuestion = value.prompt.split('//')[0];
              const ppl = await this.text2ppl(pplQuestion, value.index);
              return {
                ...value,
                ppl,
              };
            }),
            // query sample data with ppl
            switchMap(async (value) => {
              const ppl = topN(value.ppl, 2);
              const sample = await this.http.post('/api/ppl/search', {
                body: JSON.stringify({ query: ppl, format: 'jdbc' }),
              });
              return { ...value, sample };
            }),
            // call llm to generate vega
            switchMap(async (value) => {
              const prompt = createPrompt(value.prompt, value.ppl, value.sample);
              const result = await this.text2vega(prompt);
              result.data = {
                url: {
                  '%type%': 'ppl',
                  query: value.ppl,
                },
              };
              return result;
            }),
            catchError((e) => of({ error: e }))
          )
        )
      )
      .pipe(tap(() => this.status$.next('STOPPED')));
  }

  async text2vega(query: string) {
    const escapeField = (json: any, field: string) => {
      if (json[field]) {
        if (typeof json[field] === 'string') {
          json[field] = json[field].replace(/\./g, '\\.');
        }
        if (typeof json[field] === 'object') {
          Object.keys(json[field]).forEach((p) => {
            escapeField(json[field], p);
          });
        }
      }
    };
    const res = await this.http.post('/api/llm/text2vega', {
      body: JSON.stringify({ query }),
    });
    let result = res.body.inference_results[0].output[0].dataAsMap;
    // sometimes llm returns {response: <schema>} instead of <schema>
    if (result.response) {
      result = JSON.parse(result.response);
    }
    // need to escape field: geo.city -> field: geo\\.city
    escapeField(result, 'encoding');
    return result;
  }

  async text2ppl(query: string, index: string) {
    const pplResponse = await this.http.post('/api/llm/text2ppl', {
      body: JSON.stringify({
        question: query,
        index: index,
      }),
    });
    const result = JSON.parse(pplResponse.body.inference_results[0].output[0].result);
    return result.ppl;
  }

  invoke(value: { prompt: string; index: string }) {
    this.input$.next(value);
  }

  getStatus$() {
    return this.status$;
  }

  getResult$() {
    return this.result$;
  }
}
