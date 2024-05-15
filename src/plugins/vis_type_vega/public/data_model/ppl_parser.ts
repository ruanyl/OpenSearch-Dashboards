import { i18n } from '@osd/i18n';
import { Data, UrlObject, PPLQueryRequest } from './types';
import { HttpSetup } from 'opensearch-dashboards/public';

export class PPLQueryParser {
  http: HttpSetup;

  constructor(http: HttpSetup) {
    this.http = http;
  }

  /**
   * TODO: handle time range from context
   */
  parseUrl(dataObject: Data, url: UrlObject) {
    // data.url.query must be defined
    if (!url.query || typeof url.query !== 'string') {
      throw new Error(
        i18n.translate('visTypeVega.pplQueryParser.dataUrl.PPL.queryCannotBeEmpty', {
          defaultMessage: '{dataUrlParam} must have query specified',
          values: {
            dataUrlParam: '"data.url"',
          },
        })
      );
    }
    return { dataObject, ppl: url.query };
  }

  async populateData(requests: PPLQueryRequest[]) {
    const searches = requests.map((r) =>
      this.http.post('/api/ppl/search', { body: JSON.stringify({ query: r.ppl, format: 'jdbc' }) })
    );
    const responses = await Promise.all(searches);

    responses.forEach((data) => {
      const requestObject = requests.find((r) => r.dataObject.name === data.name);

      if (requestObject) {
        requestObject.dataObject.values = data;
      }
    });
  }
}
