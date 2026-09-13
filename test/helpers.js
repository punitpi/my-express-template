export async function buildApp () {
  const { default: app } = await import('../src/app.js')
  return app
}
