// Lee un .xlsx generado por el panel (ZIP sin compresión) y verifica su integridad
// con el zipfile de Python (chequea CRC de cada archivo).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function leerXlsx(bytes) {
  const buf = Buffer.from(bytes);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kuerre-xlsx-')), 'a.xlsx');
  fs.writeFileSync(f, buf);
  const out = execFileSync('python3', ['-I', '-c', `
import zipfile, json, sys
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
print(json.dumps({"bad": bad, "files": {n: z.read(n).decode("utf-8") for n in z.namelist()}}))
`, f]).toString();
  return JSON.parse(out);
}
