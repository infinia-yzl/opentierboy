import {ReaderIcon} from "@radix-ui/react-icons"

import {Toggle} from "@/components/ui/toggle"

export function ZenToggle() {
  return (
    <Toggle aria-label="Toggle zen mode">
      <ReaderIcon className="mr-2 h-4 w-4"/>
      Zen
    </Toggle>
  )
}
