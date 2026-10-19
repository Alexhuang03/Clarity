"use client";

import { useCallback } from "react";
import type { MessageRow, PartRow } from "@/lib/course/types";
import { CourseOutline } from "@/components/course/course-outline";
import { CourseColumns } from "@/components/course/layout";
import { SourcesOpenable } from "@/components/course/source-chip";
import { MessageItem } from "@/components/course/workspace";

/** Conversation d'un cours partagé, en lecture seule, avec le sommaire à gauche. */
export function SharedConversation({
  parts,
  messages,
  footer,
}: {
  parts: PartRow[];
  messages: MessageRow[];
  footer: React.ReactNode;
}) {
  const partTitle = useCallback((id: string | null) => parts.find((p) => p.id === id)?.title, [parts]);
  return (
    <SourcesOpenable value={false}>
      <CourseColumns aside={<CourseOutline messages={messages} partTitle={partTitle} />}>
        <div className="space-y-10 py-8">
          {messages.length === 0 ? (
            <p className="text-center opacity-70">Ce cours n&apos;a pas encore de résumé.</p>
          ) : (
            messages.map((message) => (
              <MessageItem key={message.id} message={message} partTitle={partTitle(message.part_id)} />
            ))
          )}
        </div>
        {footer}
      </CourseColumns>
    </SourcesOpenable>
  );
}
