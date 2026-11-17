import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Inspect only the Git index. Never print matched values, tokens or private paths.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('Stage the intended release files before running this check.');
const forbidden = /(?:^|\/)(?:node_modules|dist|output|exports|cases|samples|private|backups|\.git|__pycache__)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:log|bak|key|pem|pfx|p12|har|task|tflite|wav|zip)$/i;
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['service-token', /\b(?:sk-[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16})\b/],
  ['credential-assignment', /(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ['personal-filesystem-path', /\b[A-Z]:[\\/](?:Users|Downloads)[\\/]|\/(?:Users|home)\/[^/\s]+\//i],
  ['private-upload-reference', /user_upload_by_module\/session_file\//],
  ['local-account-domain', /@(?:students|staff)\.local\b/i],
];
const failures = [];
let bytes = 0;
for (const file of files) {
  if (forbidden.test(file)) failures.push({ file, rule: 'excluded-artifact' });
  const data = execFileSync('git', ['show', `:${file}`], { maxBuffer: 16 * 1024 * 1024 });
  bytes += data.length;
  if (data.includes(0)) continue; // Bundled audio is checked by filename/provenance, not as text.
  const text = data.toString('utf8');
  for (const [rule, pattern] of rules) if (pattern.test(text)) failures.push({ file, rule });
}
const packageJson = JSON.parse(execFileSync('git', ['show', ':package.json'], { encoding: 'utf8' }));
const release = /^0\.(\d{2})(?:\.(\d+))?$/.exec(packageJson.releaseVersion);
const expectedVersion = release ? (release[2] === undefined ? `0.0.${Number(release[1])}` : `0.${Number(release[1])}.${Number(release[2])}`) : null;
if (!expectedVersion || packageJson.version !== expectedVersion) failures.push({ file: 'package.json', rule: 'release-version' });
// Verify original samples and fixture images have not silently been bundled.
const workingTree = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
if (workingTree.version !== packageJson.version) failures.push({ file: 'package.json', rule: 'unstaged-version' });
if (failures.length) { console.error(JSON.stringify({ status: 'failed', failures }, null, 2)); process.exitCode = 1; }
else console.log(JSON.stringify({ status: 'passed', files: files.length, bytes, packageVersion: packageJson.version, tag: packageJson.releaseVersion, checks: rules.map(([name]) => name) }, null, 2));
