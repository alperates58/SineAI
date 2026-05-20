import fs from 'fs';

export async function* readCsvRows(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  let headers = null;
  let field = '';
  let row = [];
  let inQuotes = false;

  for await (const chunk of stream) {
    for (let index = 0; index < chunk.length; index++) {
      const char = chunk[index];

      if (char === '"') {
        if (inQuotes && chunk[index + 1] === '"') {
          field += '"';
          index++;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        row.push(field);
        field = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r') continue;
        row.push(field);
        field = '';

        if (row.length === 1 && row[0] === '') {
          row = [];
          continue;
        }

        if (!headers) {
          headers = row.map((header) => header.trim());
        } else {
          yield toObject(headers, row);
        }

        row = [];
        continue;
      }

      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!headers) {
      headers = row.map((header) => header.trim());
    } else {
      yield toObject(headers, row);
    }
  }
}

function toObject(headers, values) {
  return headers.reduce((carry, header, index) => {
    carry[header] = values[index] ?? '';
    return carry;
  }, {});
}
