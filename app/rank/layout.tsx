import React from "react";
import {EditorStartHold} from "@/components/StartHold";
import {RankEditor} from "@/components/RankEditor";

/**
 * The editor of every /rank page. It sits here, above the two routes that draw it (the built
 * template pages, and the addresses with a list in their link: lib/rankRoute.ts), so it stays the
 * same editor while the visitor's changes move the address from one route to the other. It reads
 * the template from the path and the list from the link, in the server's copy and in the browser
 * alike; nothing about the list passes from the server as props.
 */
export default function RankLayout({children}: {children: React.ReactNode}) {
  return (
    <div className="flex flex-col items-center justify-center">
      {children}
      <EditorStartHold/>
      <RankEditor/>
    </div>
  );
}
