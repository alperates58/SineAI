import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DEFAULT_DATABASE_PATH = './data/media.sqlite';

export function resolveDatabasePath(databasePath = process.env.MEDIA_DATABASE_PATH || DEFAULT_DATABASE_PATH) {
  return path.resolve(databasePath);
}

export function openMediaDatabase(databasePath = process.env.MEDIA_DATABASE_PATH || DEFAULT_DATABASE_PATH) {
  const resolvedPath = resolveDatabasePath(databasePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMediaMigrations(db);

  return db;
}

export function runMediaMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NULL,
      source_dataset TEXT NULL,
      source_row_hash TEXT NULL,
      tmdb_id INTEGER NULL,
      imdb_id TEXT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
      title TEXT NULL,
      original_title TEXT NULL,
      overview TEXT NULL,
      tagline TEXT NULL,
      release_date TEXT NULL,
      first_air_date TEXT NULL,
      last_air_date TEXT NULL,
      year INTEGER NULL,
      runtime INTEGER NULL,
      episode_run_time INTEGER NULL,
      number_of_seasons INTEGER NULL,
      number_of_episodes INTEGER NULL,
      status TEXT NULL,
      original_language TEXT NULL,
      adult INTEGER NOT NULL DEFAULT 0,
      in_production INTEGER NULL,
      poster_path TEXT NULL,
      backdrop_path TEXT NULL,
      homepage TEXT NULL,
      vote_average REAL NULL,
      vote_count INTEGER NULL,
      popularity REAL NULL,
      imdb_rating REAL NULL,
      imdb_votes INTEGER NULL,
      budget INTEGER NULL,
      revenue INTEGER NULL,
      genres_json TEXT NULL,
      keywords_json TEXT NULL,
      cast_json TEXT NULL,
      crew_json TEXT NULL,
      director_json TEXT NULL,
      writers_json TEXT NULL,
      producers_json TEXT NULL,
      created_by_json TEXT NULL,
      networks_json TEXT NULL,
      languages_json TEXT NULL,
      origin_country_json TEXT NULL,
      production_companies_json TEXT NULL,
      production_countries_json TEXT NULL,
      spoken_languages_json TEXT NULL,
      raw_csv_json TEXT NULL,
      raw_tmdb_json TEXT NULL,
      needs_tmdb_enrichment INTEGER NOT NULL DEFAULT 1,
      tmdb_enriched_at TEXT NULL,
      imported_at TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS media_items_media_type_tmdb_id_unique
      ON media_items (media_type, tmdb_id);
    CREATE UNIQUE INDEX IF NOT EXISTS media_items_dataset_row_hash_unique
      ON media_items (source_dataset, source_row_hash);
    CREATE INDEX IF NOT EXISTS media_items_media_type_index ON media_items (media_type);
    CREATE INDEX IF NOT EXISTS media_items_title_index ON media_items (title);
    CREATE INDEX IF NOT EXISTS media_items_original_title_index ON media_items (original_title);
    CREATE INDEX IF NOT EXISTS media_items_year_index ON media_items (year);
    CREATE INDEX IF NOT EXISTS media_items_release_date_index ON media_items (release_date);
    CREATE INDEX IF NOT EXISTS media_items_first_air_date_index ON media_items (first_air_date);
    CREATE INDEX IF NOT EXISTS media_items_vote_average_index ON media_items (vote_average);
    CREATE INDEX IF NOT EXISTS media_items_vote_count_index ON media_items (vote_count);
    CREATE INDEX IF NOT EXISTS media_items_popularity_index ON media_items (popularity);
    CREATE INDEX IF NOT EXISTS media_items_imdb_rating_index ON media_items (imdb_rating);
    CREATE INDEX IF NOT EXISTS media_items_imdb_votes_index ON media_items (imdb_votes);
    CREATE INDEX IF NOT EXISTS media_items_adult_index ON media_items (adult);
    CREATE INDEX IF NOT EXISTS media_items_needs_tmdb_enrichment_index ON media_items (needs_tmdb_enrichment);

    CREATE TABLE IF NOT EXISTS media_import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_type TEXT NOT NULL CHECK (dataset_type IN ('movie', 'tv')),
      source_dataset TEXT NOT NULL,
      file_path TEXT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      skipped_rows INTEGER NOT NULL DEFAULT 0,
      failed_rows INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NULL,
      completed_at TEXT NULL,
      failed_at TEXT NULL,
      last_error TEXT NULL,
      metadata_json TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_import_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NULL,
      dataset_type TEXT NULL,
      row_number INTEGER NULL,
      row_hash TEXT NULL,
      error_message TEXT NOT NULL,
      raw_row_json TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES media_import_batches(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS media_enrichment_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
      tmdb_id INTEGER NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
      priority INTEGER NOT NULL DEFAULT 5,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      scheduled_at TEXT NULL,
      started_at TEXT NULL,
      completed_at TEXT NULL,
      failed_at TEXT NULL,
      payload_json TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tmdb_api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      status_code INTEGER NULL,
      response_time_ms INTEGER NULL,
      was_rate_limited INTEGER NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      request_json TEXT NULL,
      response_json TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE SET NULL
    );
  `);
}
