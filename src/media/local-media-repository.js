const MEDIA_ITEM_COLUMNS = [
  'source', 'source_dataset', 'source_row_hash', 'tmdb_id', 'imdb_id', 'media_type',
  'title', 'original_title', 'overview', 'tagline', 'release_date', 'first_air_date',
  'last_air_date', 'year', 'runtime', 'episode_run_time', 'number_of_seasons',
  'number_of_episodes', 'status', 'original_language', 'adult', 'in_production',
  'poster_path', 'backdrop_path', 'homepage', 'vote_average', 'vote_count',
  'popularity', 'imdb_rating', 'imdb_votes', 'budget', 'revenue', 'genres_json',
  'keywords_json', 'cast_json', 'crew_json', 'director_json', 'writers_json',
  'producers_json', 'created_by_json', 'networks_json', 'languages_json',
  'origin_country_json', 'production_companies_json', 'production_countries_json',
  'spoken_languages_json', 'raw_csv_json', 'raw_tmdb_json', 'needs_tmdb_enrichment',
  'tmdb_enriched_at', 'imported_at',
];

const JSON_COLUMNS = new Set(MEDIA_ITEM_COLUMNS.filter((column) => column.endsWith('_json')));

export class LocalMediaRepository {
  constructor(db) {
    this.db = db;
    this.upsertStatement = this.prepareUpsert();
  }

  upsertMediaItem(item) {
    const payload = {};
    for (const column of MEDIA_ITEM_COLUMNS) {
      payload[column] = serializeValue(column, item[column] ?? null);
    }

    return this.upsertStatement.run(payload);
  }

  existsByDatasetHash(sourceDataset, sourceRowHash) {
    const row = this.db.prepare(`
      SELECT id FROM media_items
      WHERE source_dataset = ? AND source_row_hash = ?
      LIMIT 1
    `).get(sourceDataset, sourceRowHash);

    return Boolean(row);
  }

  search({ query = '', type = 'any', limit = 20 } = {}) {
    const clauses = [];
    const params = {};

    if (type !== 'any') {
      clauses.push('media_type = @type');
      params.type = type;
    }

    if (query) {
      clauses.push('(title LIKE @query OR original_title LIKE @query OR overview LIKE @query)');
      params.query = `%${query}%`;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT * FROM media_items
      ${where}
      ORDER BY popularity DESC, vote_count DESC
      LIMIT @limit
    `).all({ ...params, limit });
  }

  createBatch(batch) {
    const result = this.db.prepare(`
      INSERT INTO media_import_batches
        (dataset_type, source_dataset, file_path, status, metadata_json, started_at, created_at, updated_at)
      VALUES
        (@dataset_type, @source_dataset, @file_path, @status, @metadata_json, @started_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run({
      ...batch,
      metadata_json: JSON.stringify(batch.metadata_json ?? null),
    });

    return result.lastInsertRowid;
  }

  updateBatch(id, values) {
    const columns = Object.keys(values);
    if (columns.length === 0) return;

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ');
    this.db.prepare(`
      UPDATE media_import_batches
      SET ${assignments}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...values, id });
  }

  logImportError(error) {
    this.db.prepare(`
      INSERT INTO media_import_errors
        (batch_id, dataset_type, row_number, row_hash, error_message, raw_row_json, created_at)
      VALUES
        (@batch_id, @dataset_type, @row_number, @row_hash, @error_message, @raw_row_json, CURRENT_TIMESTAMP)
    `).run({
      ...error,
      raw_row_json: JSON.stringify(error.raw_row_json ?? null),
    });
  }

  truncateImportTables() {
    this.db.exec(`
      DELETE FROM media_import_errors;
      DELETE FROM media_enrichment_jobs;
      DELETE FROM media_import_batches;
      DELETE FROM media_items;
    `);
  }

  prepareUpsert() {
    const insertColumns = MEDIA_ITEM_COLUMNS.join(', ');
    const values = MEDIA_ITEM_COLUMNS.map((column) => `@${column}`).join(', ');
    const updatesByHash = MEDIA_ITEM_COLUMNS
      .filter((column) => !['source_dataset', 'source_row_hash'].includes(column))
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');
    const updatesByTmdb = MEDIA_ITEM_COLUMNS
      .filter((column) => !['media_type', 'tmdb_id'].includes(column))
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');

    return this.db.prepare(`
      INSERT INTO media_items (${insertColumns}, created_at, updated_at)
      VALUES (${values}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(source_dataset, source_row_hash) DO UPDATE SET
        ${updatesByHash},
        updated_at = CURRENT_TIMESTAMP
      ON CONFLICT(media_type, tmdb_id) DO UPDATE SET
        ${updatesByTmdb},
        updated_at = CURRENT_TIMESTAMP
    `);
  }
}

function serializeValue(column, value) {
  if (JSON_COLUMNS.has(column)) {
    return value === null || value === undefined ? null : JSON.stringify(value);
  }

  return value;
}
