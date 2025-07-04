export default defineNuxtPlugin(() => {
  return {
    provide: {
      toast: {
        show: (title, message = '', type = 'info', duration = 3000) => {
          if (process.client && window.$toastContainer) {
            window.$toastContainer.show(title, message, type, duration)
          }
        },
        success: (title, message = '', duration = 3000) => {
          if (process.client && window.$toastContainer) {
            window.$toastContainer.success(title, message, duration)
          }
        },
        error: (title, message = '', duration = 3000) => {
          if (process.client && window.$toastContainer) {
            window.$toastContainer.error(title, message, duration)
          }
        },
        info: (title, message = '', duration = 3000) => {
          if (process.client && window.$toastContainer) {
            window.$toastContainer.info(title, message, duration)
          }
        }
      }
    }
  }
}) 