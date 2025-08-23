export default defineNitroConfig({
  preset: 'vercel',
  vercel: {
    functions: {
      'server/api/**/*.ts': {
        maxDuration: 30
      }
    }
  }
})
