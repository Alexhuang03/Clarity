"use client";

import { useCallback } from "react";
import type { MessageRow, PartRow } from "@/lib/course/types";
import type { CourseWebSources } from "@/lib/teach/types";
import { CourseOutline } from "@/components/course/course-outline";
import { CourseColumns } from "@/components/course/layout";
import { SourcesOpenable } from "@/components/course/source-chip";
import { WebSourcesContext, WebSourcesNotice, WebSourcesSection } from "@/components/course/web-sources";
import { MessageItem } from "@/components/course/workspace";
import { useT } from "@/lib/i18n/client";

/** Conversation d'un cours partagé, en lecture seule, avec le sommaire à gauche. */
export function SharedConversation({
  parts,
  messages,
  webSources = null,
  footer,
}: {
  parts: PartRow[];
  messages: MessageRow[];
  /** Cours du mode professeur : sources web déjà vérifiées par le serveur (null sinon) */
  webSources?: CourseWebSources | null;
  footer: React.ReactNode;
}) {
  const { t } = useT();
  const partTitle = useCallback((id: string | null) => parts.find((p) => p.id === id)?.title, [parts]);
  return (
    <SourcesOpenable value={false}>
      <WebSourcesContext value={webSources?.sources ?? null}>
        <CourseColumns aside={<CourseOutline messages={messages} parts={parts} />}>
          <div className="space-y-10 py-8">
            {webSources && <WebSourcesNotice data={webSources} />}
            {messages.length === 0 ? (
              <p className="text-center opacity-70">{t.share.noSummary}</p>
            ) : (
              messages.map((message) => (
                <MessageItem key={message.id} message={message} partTitle={partTitle(message.part_id)} />
              ))
            )}
            {webSources && <WebSourcesSection data={webSources} />}
          </div>
          {footer}
        </CourseColumns>
      </WebSourcesContext>
    </SourcesOpenable>
  );
}
