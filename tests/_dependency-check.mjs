export async function haveRuntimeDependencies() {
  const names = ['@netlify/blobs', 'bcryptjs', 'jsonwebtoken'];
  for (const name of names) {
    try {
      await import(name);
    } catch {
      return false;
    }
  }
  return true;
}
