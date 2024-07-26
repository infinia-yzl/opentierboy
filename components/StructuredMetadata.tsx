import Script from 'next/script'

const StructuredMetadata = ({data}: { data: object }) => {
  return (
    <Script
      id="structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{__html: JSON.stringify(data)}}
    />
  )
}

export default StructuredMetadata
