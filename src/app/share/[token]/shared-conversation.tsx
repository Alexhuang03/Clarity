"use client";

import type { MessageRow, PartRow } from "@/lib/course/types";
import { SourcesOpenable } from "@/components/course/source-chip";
import { MessageItem } from "@/components/course/workspace";

/** Conversation d'un cours partagé, en lecture seule. */
export function SharedConversation({ parts, messages }: { parts: PartRow[]; messages: MessageRow[] }) {
  const partTitle = (id: string | null) => parts.find((p) => p.id === id)?.title;
  return (
    <SourcesOpenable value={false}>
      <div className="space-y-10 py-8">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} partTitle={partTitle(message.part_id)} />
        ))}
      </div>
    </SourcesOpenable>
  );
}
