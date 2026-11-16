'use strict';
// Diff per righe (LCS) con limitazione per file molto grandi.
function diffLines(a, b) {
  const A = String(a ?? '').split('\n');
  const B = String(b ?? '').split('\n');
  // rimuove prefisso e suffisso comuni
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length - 1, endB = B.length - 1;
  while (endA >= start && endB >= start && A[endA] === B[endB]) { endA--; endB--; }
  const a2 = A.slice(start, endA + 1), b2 = B.slice(start, endB + 1);
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ t: '=', a: i + 1, b: i + 1, line: A[i] });
  if (a2.length * b2.length > 4_000_000) {
    a2.forEach((l, i) => ops.push({ t: '-', a: start + i + 1, line: l }));
    b2.forEach((l, i) => ops.push({ t: '+', b: start + i + 1, line: l }));
  } else {
    const n = a2.length, m = b2.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) { ops.push({ t: '=', a: start + i + 1, b: start + j + 1, line: a2[i] }); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push({ t: '+', b: start + j + 1, line: b2[j] }); j++; }
      else { ops.push({ t: '-', a: start + i + 1, line: a2[i] }); i++; }
    }
  }
  for (let k = 0; endA + 1 + k < A.length; k++) ops.push({ t: '=', a: endA + 2 + k, b: endB + 2 + k, line: A[endA + 1 + k] });
  const stats = { added: ops.filter((o) => o.t === '+').length, removed: ops.filter((o) => o.t === '-').length };
  return { ops, stats };
}

function diffProjects(filesA, filesB) {
  const names = [...new Set([...Object.keys(filesA || {}), ...Object.keys(filesB || {})])].sort();
  return names.map((name) => {
    const a = filesA?.[name], b = filesB?.[name];
    const status = a === undefined ? 'added' : b === undefined ? 'removed' : a === b ? 'same' : 'changed';
    return { name, status, diff: status === 'same' ? null : diffLines(a ?? '', b ?? '') };
  });
}

module.exports = { diffLines, diffProjects };
