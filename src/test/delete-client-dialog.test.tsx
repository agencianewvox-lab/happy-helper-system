import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteClientDialog } from "@/components/DeleteClientDialog";

const open = () => fireEvent.click(screen.getByRole("button", { name: "Excluir cliente" }));
const typeConfirmation = (value = "EXCLUIR") => fireEvent.change(screen.getByLabelText("Digite EXCLUIR para confirmar"), { target: { value } });
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Excluir definitivamente" }));

describe("Mandatory client deletion confirmation", () => {
  it("one click only opens the warning, identifies the client and focuses Cancel", () => {
    const remove = vi.fn();
    render(<DeleteClientDialog clientName="Titanium Odontologia" onConfirm={remove} />);
    open();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Tem certeza");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Titanium Odontologia");
    expect(screen.getByRole("button", { name: "Cancelar, manter cliente" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Excluir definitivamente" })).toBeDisabled();
    confirm();
    expect(remove).not.toHaveBeenCalled();
  });

  it("cancel keeps the client and resets the confirmation on reopening", () => {
    const remove = vi.fn();
    render(<DeleteClientDialog clientName="Titanium" onConfirm={remove} />);
    open();
    typeConfirmation();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar, manter cliente" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    open();
    expect(screen.getByLabelText("Digite EXCLUIR para confirmar")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Excluir definitivamente" })).toBeDisabled();
  });

  it("requires the exact phrase and a separate explicit confirmation", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    render(<DeleteClientDialog clientName="Titanium" onConfirm={remove} />);
    open();
    typeConfirmation("sim");
    confirm();
    expect(remove).not.toHaveBeenCalled();
    typeConfirmation();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Digite EXCLUIR para confirmar"), { key: "Enter" });
    expect(remove).not.toHaveBeenCalled();
    confirm();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("does not close or send duplicate operations while deletion is in flight", async () => {
    let finish!: () => void;
    const remove = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<DeleteClientDialog clientName="Titanium" onConfirm={remove} />);
    open();
    typeConfirmation();
    confirm();
    const pending = screen.getByRole("button", { name: "Excluindo…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar, manter cliente" }));
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows failure, never assumes success and requires a new confirmation before retry", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("database unavailable"));
    render(<DeleteClientDialog clientName="Titanium" onConfirm={remove} />);
    open();
    typeConfirmation();
    confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir definitivamente" })).toBeDisabled();
    expect(screen.getByLabelText("Digite EXCLUIR para confirmar")).toHaveValue("");
  });

  it("cannot carry a confirmation to another client", () => {
    const remove = vi.fn();
    const { rerender } = render(<DeleteClientDialog key="first" clientName="Titanium" onConfirm={remove} />);
    open();
    typeConfirmation();
    rerender(<DeleteClientDialog key="second" clientName="Outro cliente" onConfirm={remove} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    open();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Outro cliente");
    expect(screen.getByRole("button", { name: "Excluir definitivamente" })).toBeDisabled();
    expect(remove).not.toHaveBeenCalled();
  });
});
