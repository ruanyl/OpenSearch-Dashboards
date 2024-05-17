import { BehaviorSubject, Observable, of } from 'rxjs';
import {
  takeWhile,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  tap,
  filter,
  catchError,
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

You seem not quite understand how to set y-scales of the different layers, the correct syntax is {"resolve": {"scale": {"y": "independent"}}} please use it when appropriate.
Just return the chart specification json based on Vega-Lite format.
Just reply with the json based Vega-Lite object, do not include any other content in the reply.
`;
};

export class Text2Vega {
  input$: BehaviorSubject<string>;
  vega$: Observable<string | Error>;
  http: HttpSetup;

  constructor(http: HttpSetup) {
    this.http = http;
    this.input$ = new BehaviorSubject('');
    this.vega$ = this.input$.pipe(
      tap((v) => console.log(v)),
      filter((v) => v.length > 0),
      debounceTime(200),
      distinctUntilChanged(),
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
        const ppl = topN(value.ppl, 5);
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
      })
    );
  }

  async text2vega(query: string) {
    const res = await this.http.post('/api/llm/text2vega', {
      body: JSON.stringify({ query }),
    });
    console.log('llm res: ', res);
    return res;
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
