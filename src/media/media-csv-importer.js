import fs from 'fs';
import readline from 'readline';
import { readCsvRows } from './csv-stream.js';
import { LocalMediaRepository } from './local-media-repository.js';
import { MediaRowMapper, MOVIE_SOURCE_DATASET, TV_SOURCE_DATASET } from './media-row-mapper.js';

const VALID_TYPES = new Set(['movie', 'tv']);

export class MediaCsvImporter {
  constructor({ db, repository = new LocalMediaRepository(db), mapper = new MediaRowMapper(), output = console } = {}) {
    this.db = db;
    this.repository = repository;
    this.mapper = mapper;
    this.output = output;
  }

  async import({ type, path, limit = null, dryRun = false, skipExisting = false, truncate = false, force = false }) {
    if (!VALID_TYPES.has(type)) throw new Error('--type must be movie or tv');
    if (!path || !fs.existsSync(path)) throw new Error(`CSV file not found: ${path}`);

    if (truncate) {
      await this.confirmTruncate(force);
      if (!dryRun) this.repository.truncateImportTables();
    }

    const sourceDataset = type === 'movie' ? MOVIE_SOURCE_DATASET : TV_SOURCE_DATASET;
    const batchId = dryRun ? null : this.repository.createBatch({
      dataset_type: type,
      source_dataset: sourceDataset,
      file_path: path,
      status: 'processing',
      metadata_json: { dry_run: dryRun, limit, skip_existing: skipExisting },
      started_at: new Date().toISOString(),
    });

    let totalRows = 0;
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    try {
      for await (const row of readCsvRows(path)) {
        if (limit && totalRows >= limit) break;
        totalRows++;

        try {
          const mapped = this.mapper.map(type, row);

          if (!mapped.tmdb_id) {
            throw new Error('Missing or invalid TMDB id');
          }

          if (skipExisting && this.repository.existsByDatasetHash(mapped.source_dataset, mapped.source_row_hash)) {
            skippedRows++;
          } else if (!dryRun) {
            this.repository.upsertMediaItem(mapped);
            importedRows++;
          } else {
            importedRows++;
          }
        } catch (error) {
          failedRows++;
          const rowHash = safeHash(type, row, this.mapper);

          if (!dryRun) {
            this.repository.logImportError({
              batch_id: batchId,
              dataset_type: type,
              row_number: totalRows,
              row_hash: rowHash,
              error_message: error.message,
              raw_row_json: row,
            });
          }
        }

        if (totalRows % 1000 === 0) {
          this.output.log(`Processed ${totalRows} rows: imported=${importedRows}, skipped=${skippedRows}, failed=${failedRows}`);
        }
      }

      if (!dryRun) {
        this.repository.updateBatch(batchId, {
          status: 'completed',
          total_rows: totalRows,
          imported_rows: importedRows,
          skipped_rows: skippedRows,
          failed_rows: failedRows,
          completed_at: new Date().toISOString(),
        });
      }

      this.output.log(`Completed ${type} import: total=${totalRows}, imported=${importedRows}, skipped=${skippedRows}, failed=${failedRows}${dryRun ? ' (dry-run)' : ''}`);
      return { batchId, totalRows, importedRows, skippedRows, failedRows };
    } catch (error) {
      if (!dryRun && batchId) {
        this.repository.updateBatch(batchId, {
          status: 'failed',
          total_rows: totalRows,
          imported_rows: importedRows,
          skipped_rows: skippedRows,
          failed_rows: failedRows,
          failed_at: new Date().toISOString(),
          last_error: error.message,
        });
      }

      throw error;
    }
  }

  async confirmTruncate(force) {
    if (force) return;

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      rl.question('This will delete local media import tables. Type "yes" to continue: ', resolve);
    });
    rl.close();

    if (String(answer).trim().toLowerCase() !== 'yes') {
      throw new Error('Truncate cancelled.');
    }
  }
}

function safeHash(type, row, mapper) {
  try {
    return mapper.map(type, row).source_row_hash;
  } catch {
    return null;
  }
}
