import { BehaviorSubject, Observable } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  tap,
  filter,
  finalize,
} from 'rxjs/operators';
import { HttpSetup } from 'opensearch-dashboards/public';

const topN = (ppl: string, n: number) => `${ppl} | head ${n}`;

const createPrompt = (input: string, ppl: string, sample: any) => {
  return `
Your task is to generate Vega-Lite chart specifications based on the given data, the data schema, the PPL query to get the data and the user's instruction.

The data is represented in json format:
${JSON.stringify(sample.jsonData, null, 4)}

This is the schema of the data:
${JSON.stringify(sample.schema, null, 4)}

The PPL query to get the json data is:
${ppl}

The user's instruction is: ${input}

when a field has a dot(.), you should escape the dot if the field is a single field. For example, if the field is "user.name", but the data is {"user.name": "John"}, the field should be escaped. But it should not be escaped if the data is {"user": {"name": "John"}}

If mark.type = point and shape.field is a field of the data, the definition of the shape should be inside the root "encoding" object, NOT in the "mark" object, for example, {"encoding": {"shape": {"field": "field_name"}}}

Just return the chart specification json based on Vega-Lite format.
Just reply with the json based Vega-Lite object, do not include any other content in the reply.
`;
};

const llmRunning$ = new BehaviorSubject(false);
// @ts-ignore
window['llmRunning$'] = llmRunning$;

export class Text2Vega {
  input$: BehaviorSubject<string>;
  vega$: Observable<string | Error>;
  http: HttpSetup;

  constructor(http: HttpSetup) {
    this.http = http;
    this.input$ = new BehaviorSubject('');
    this.vega$ = this.input$.pipe(
      filter((v) => v.length > 0),
      debounceTime(200),
      distinctUntilChanged(),
      tap((v) => llmRunning$.next(true)),
      // text to ppl
      switchMap(async (value) => {
        const pplQuestion = value.split('//')[0];
        try {
          const ppl = await this.text2ppl(pplQuestion);
          return {
            input: value,
            ppl,
          };
        } catch (e) {
          return new Error('Cannot generate ppl');
        }
      }),
      // query sample data with ppl
      switchMap(async (value) => {
        if (value instanceof Error) {
          return value;
        }
        const ppl = topN(value.ppl, 2);
        const sample = await this.http.post('/api/ppl/search', {
          body: JSON.stringify({ query: ppl, format: 'jdbc' }),
        });
        return { ...value, sample };
      }),
      // call llm to generate vega
      switchMap(async (value) => {
        if (value instanceof Error) {
          return value;
        }
        const prompt = createPrompt(value.input, value.ppl, value.sample);
        const result = await this.text2vega(prompt);
        delete result.data['values'];
        result.data.url = {
          '%type%': 'ppl',
          query: value.ppl,
        };
        return result;
      }),
      tap(() => llmRunning$.next(false)),
      finalize(() => llmRunning$.next(false))
    );
  }

  async text2vega(query: string) {
    try {
      const res = await this.http.post('/api/llm/text2vega', {
        body: JSON.stringify({ query }),
      });
      console.log('llm res: ', res);
      // return res;
      const result = res.body.inference_results[0].output[0].dataAsMap;
      return result;
    } catch (e) {
      console.log(e);
    }
  }

  async text2ppl(query: string) {
    try {
      const pplResponse = await this.http.post('/api/llm/text2ppl', {
        body: JSON.stringify({
          question: query,
          index: 'opensearch_dashboards_sample_data_logs',
        }),
      });
      // eslint-disable-next-line no-console
      console.log(pplResponse);
      const result = JSON.parse(pplResponse.body.inference_results[0].output[0].result);
      console.log(result);
      return result.ppl;
    } catch (e) {
      console.log(e);
    }
  }

  updateInput(value: string) {
    this.input$.next(value);
  }

  getVega$() {
    return this.vega$;
  }
}
