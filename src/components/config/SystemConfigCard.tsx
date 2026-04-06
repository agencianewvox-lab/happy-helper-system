import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Check } from "lucide-react";

interface SystemConfig {
  id: string;
  config_key: string;
  config_label: string;
  config_category: string;
  config_value: string;
  config_type: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface Props {
  config: SystemConfig;
  editedValue: string | undefined;
  onValueChange: (id: string, value: string) => void;
  onSave: (config: SystemConfig) => void;
  onCancel: (id: string) => void;
  saving: boolean;
}

export function SystemConfigCard({ config, editedValue, onValueChange, onSave, onCancel, saving }: Props) {
  const currentValue = editedValue ?? config.config_value;
  const hasChanges = editedValue !== undefined && editedValue !== config.config_value;

  const renderInput = () => {
    if (config.config_type === "textarea") {
      return (
        <Textarea
          value={currentValue}
          onChange={(e) => onValueChange(config.id, e.target.value)}
          className="min-h-[120px] text-xs font-mono leading-relaxed resize-y"
        />
      );
    }
    if (config.config_type === "password") {
      return (
        <Input
          type="password"
          value={currentValue}
          onChange={(e) => onValueChange(config.id, e.target.value)}
          className="text-sm font-mono"
        />
      );
    }
    if (config.config_type === "number") {
      return (
        <Input
          type="number"
          value={currentValue}
          onChange={(e) => onValueChange(config.id, e.target.value)}
          className="text-sm font-mono max-w-[200px]"
        />
      );
    }
    return (
      <Input
        type="text"
        value={currentValue}
        onChange={(e) => onValueChange(config.id, e.target.value)}
        className="text-sm font-mono"
      />
    );
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">{config.config_label}</CardTitle>
            {config.description && (
              <CardDescription className="text-xs mt-1">{config.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {config.updated_by && (
              <span className="text-[10px] text-muted-foreground">
                Editado por {config.updated_by} em {new Date(config.updated_at).toLocaleDateString("pt-BR")}
              </span>
            )}
            {hasChanges && (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                Não salvo
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {renderInput()}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            Chave: {config.config_key}
          </span>
          <div className="flex gap-2">
            {hasChanges && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onCancel(config.id)}>
                Cancelar
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              disabled={!hasChanges || saving}
              onClick={() => onSave(config)}
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : hasChanges ? (
                <><Save className="w-3 h-3" /> Salvar</>
              ) : (
                <><Check className="w-3 h-3" /> Salvo</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export type { SystemConfig };
