declare module 'pg' {
  export interface QueryResult<Row = Record<string, unknown>> {
    rows: Row[];
    rowCount: number;
  }

  export class Pool {
    constructor(options: { connectionString: string });
    query<Row = Record<string, unknown>>(
      text: string,
      values?: ReadonlyArray<unknown>
    ): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }
}
