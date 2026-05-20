#!/usr/bin/env node
import { openMediaDatabase } from '../src/media/database.js';
import { MediaCsvImporter } from '../src/media/media-csv-importer.js';

const options = parseArgs(process.argv.slice(2));

try {
  const db = openMediaDatabase(options.database);
  const importer = new MediaCsvImporter({ db });
  await importer.import(options);
  db.close();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {
    type: null,
    path: null,
    limit: null,
    dryRun: false,
    skipExisting: false,
    truncate: false,
    force: false,
    database: undefined,
  };

  for (const arg of args) {
    if (arg.startsWith('--type=')) options.type = arg.slice('--type='.length);
    else if (arg.startsWith('--path=')) options.path = arg.slice('--path='.length);
    else if (arg.startsWith('--limit=')) options.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    else if (arg.startsWith('--database=')) options.database = arg.slice('--database='.length);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-existing') options.skipExisting = true;
    else if (arg === '--truncate') options.truncate = true;
    else if (arg === '--force') options.force = true;
  }

  if (!options.type || !options.path) {
    throw new Error('Usage: npm run media:import-csv -- --type=movie|tv --path=/path/to/file.csv [--limit=100] [--dry-run] [--skip-existing] [--truncate --force]');
  }

  if (!Number.isFinite(options.limit)) options.limit = null;

  return options;
}
