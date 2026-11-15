import Image from 'next/image'
import OTB_LOGO from '@/public/brand/otb-logo-wide.webp'

export default function Loading() {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <span className="animate-pulse w-96 text-center opacity-50">
        <Image src={OTB_LOGO} alt="Loading"/>
        <p>Loading...</p>
      </span>
    </div>
  )
}
