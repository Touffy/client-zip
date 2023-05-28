importScripts('https://unpkg.com/client-zip/worker.js', 'https://unpkg.com/dl-stream/worker.js')

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  // This will intercept all request with a URL starting in /downloadZip/ ;
  // you should use a meaningful URL for each download, for example /downloadZip/invoices.zip
  const [,name] = url.pathname.match(/\/downloadZip\/(.+)/i) || [,]
  if (url.origin === self.origin && name)
    event.respondWith(event.request.formData()
      .then(data => downloadZip(new DownloadStream(data.getAll('url'))))
      .catch(err => new Response(err.message, { status: 500 }))
    )
})
