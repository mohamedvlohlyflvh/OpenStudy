"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui";

export function StudyAllDueButton() {
  return (
    <Link href="/flashcards?all=1">
      <Button>
        <Zap size={16} />
        STUDY ALL DUE
      </Button>
    </Link>
  );
}
