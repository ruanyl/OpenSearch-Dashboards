import { BehaviorSubject, Observable } from 'rxjs';
import {
  takeWhile,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  tap,
  filter,
} from 'rxjs/operators';
import { HttpSetup } from 'opensearch-dashboards/public';

const topN = (ppl: string, n: number) => `${ppl} | head ${n}`;

const t2ppl = (input: string) =>
  new Promise<string>((resolve) =>
    resolve(
      'source=opensearch_dashboards_sample_data_logs | stats DISTINCT_COUNT(clientip) AS unique_visitors, AVG(bytes) AS avg_bytes by span(timestamp, 3h) AS span'
    )
  );

const createPrompt = (input: string, ppl: string, sample: any) => {
  return `
Your task is to generate Vega-Lite chart specifications based on the given data, the schema, the PPL query and user's instruction.

The data is represented in json format:
${JSON.stringify(sample.jsonData, null, 4)}

This is the schema of the data:
${JSON.stringify(sample.schema, null, 4)}

The PPL query to get the json data is:
${ppl}

The user's instruction is: ${input}

Just return the chart specification json based on Vega-Lite format.
Just reply with the json based Vega-Lite object, do not include any other content in the reply.
Always choose a timeUnit if the data type is timestamp based on the schema.
  `;
};

export class Text2Vega {
  input$: BehaviorSubject<string>;
  vega$: Observable<string>;
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
        const ppl = await t2ppl(value);
        return {
          input: value,
          ppl,
        };
      }),
      // query sample data with ppl
      switchMap(async (value) => {
        const ppl = topN(value.ppl, 5);
        const sample = await this.http.post('/api/ppl/search', {
          body: JSON.stringify({ query: ppl, format: 'jdbc' }),
        });
        return { ...value, sample };
      }),
      // call llm to generate vega
      switchMap(async (value) => {
        const prompt = createPrompt(value.input, value.ppl, value.sample);
        const result = await this.text2vega(prompt);
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

  updateInput(value: string) {
    this.input$.next(value);
  }

  getVega$() {
    return this.vega$;
  }
}
