import React from "react";
import {RankEditor} from "@/components/RankEditor";

export default function RankLayout({children}: {children: React.ReactNode}) {
  return (
    <div className="flex flex-col items-center justify-center">
      {children}
      <RankEditor/>
    </div>
  );
}
