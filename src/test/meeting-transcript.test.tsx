import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MeetingTranscript } from "@/components/meetings/MeetingTranscript";
import { meetingTranscriptText, type MeetingDetail } from "@/lib/meetings";
const meeting = {
  id: "m",
  client_id: "c",
  client_name: "Cliente teste",
  title: "Alinhamento",
  status: "ready",
  started_at: "2026-10-21T12:00:00Z",
  ended_at: null,
  partial: false,
  error: null,
  reviewed_at: null,
  version: 1,
  transcript: null,
  review_notes: null,
  summary: null,
  chunks: [
    {
      seq: 0,
      status: "done",
      offset_ms: 0,
      transcript: "Áudio sem identificação",
    },
  ],
  tasks: [],
  utterances: [
    {
      id: "1",
      speaker: "Ana",
      text: "Definimos a meta",
      start_ms: 2000,
      end_ms: 5000,
      revision: 1,
      source: "meet_captions",
    },
    {
      id: "2",
      speaker: "Bruno",
      text: "Prazo na sexta",
      start_ms: 6000,
      end_ms: 8000,
      revision: 1,
      source: "meet_captions",
    },
  ],
} satisfies MeetingDetail;
describe("organized meeting transcript", () => {
  it("shows names and filters a specific participant", () => {
    render(<MeetingTranscript meeting={meeting} />);
    expect(screen.getByText("Definimos a meta")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filtrar participante"), {
      target: { value: "Bruno" },
    });
    expect(screen.queryByText("Definimos a meta")).toBeNull();
    expect(screen.getByText("Prazo na sexta")).toBeTruthy();
  });
  it("keeps unnamed audio separate, never invents a speaker", () => {
    render(<MeetingTranscript meeting={meeting} />);
    fireEvent.click(screen.getByRole("button", { name: /Áudio de apoio/ }));
    expect(screen.getByText("Áudio sem identificação")).toBeTruthy();
    expect(screen.getByText(/Pessoa não identificada/)).toBeTruthy();
  });
  it("exports named timestamps and distinguishes the duplicate support source", () => {
    const text = meetingTranscriptText(meeting);
    expect(text).toContain("[00:02] Ana: Definimos a meta");
    expect(text).toContain("SEM ATRIBUIÇÃO DE PESSOA");
    expect(text).not.toContain("undefined");
  });
});
