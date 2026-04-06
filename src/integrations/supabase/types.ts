export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          folder: string
          id: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          folder: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          folder?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          end_time: string
          event_type: string
          group_id: string | null
          id: string
          location: string | null
          participants: string[] | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_time: string
          event_type?: string
          group_id?: string | null
          id?: string
          location?: string | null
          participants?: string[] | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string
          event_type?: string
          group_id?: string | null
          id?: string
          location?: string | null
          participants?: string[] | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          author_name: string
          content: string
          created_at: string
          group_id: string
          id: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: []
      }
      coach_config: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          intervalo_minimo_minutos: number | null
          max_mensagens_dia_por_pessoa: number | null
          tipos_ativos: string[] | null
          tom: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          intervalo_minimo_minutos?: number | null
          max_mensagens_dia_por_pessoa?: number | null
          tipos_ativos?: string[] | null
          tom?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          intervalo_minimo_minutos?: number | null
          max_mensagens_dia_por_pessoa?: number | null
          tipos_ativos?: string[] | null
          tom?: string | null
        }
        Relationships: []
      }
      coach_messages: {
        Row: {
          created_at: string | null
          destinatario_nome: string
          destinatario_telefone: string | null
          enviada: boolean | null
          enviada_em: string | null
          group_id: string | null
          id: string
          mensagem: string
          resultado: string | null
          tipo: string
        }
        Insert: {
          created_at?: string | null
          destinatario_nome: string
          destinatario_telefone?: string | null
          enviada?: boolean | null
          enviada_em?: string | null
          group_id?: string | null
          id?: string
          mensagem: string
          resultado?: string | null
          tipo: string
        }
        Update: {
          created_at?: string | null
          destinatario_nome?: string
          destinatario_telefone?: string | null
          enviada?: boolean | null
          enviada_em?: string | null
          group_id?: string | null
          id?: string
          mensagem?: string
          resultado?: string | null
          tipo?: string
        }
        Relationships: []
      }
      daily_feedback_log: {
        Row: {
          created_at: string
          feedback_date: string
          feedback_message: string
          id: string
          member_name: string
        }
        Insert: {
          created_at?: string
          feedback_date?: string
          feedback_message: string
          id?: string
          member_name: string
        }
        Update: {
          created_at?: string
          feedback_date?: string
          feedback_message?: string
          id?: string
          member_name?: string
        }
        Relationships: []
      }
      nps_prediction_history: {
        Row: {
          group_id: string
          id: string
          nps_categoria: string
          nps_score: number
          recorded_at: string
        }
        Insert: {
          group_id: string
          id?: string
          nps_categoria: string
          nps_score: number
          recorded_at?: string
        }
        Update: {
          group_id?: string
          id?: string
          nps_categoria?: string
          nps_score?: number
          recorded_at?: string
        }
        Relationships: []
      }
      nps_predictions: {
        Row: {
          calculated_at: string
          confianca: number
          dimension_scores: Json
          fator_principal: string | null
          fatores_negativos: Json
          fatores_positivos: Json
          group_id: string
          id: string
          nps_categoria: string
          nps_score: number
          recomendacao: string | null
          score_anterior: number | null
          tendencia: string | null
        }
        Insert: {
          calculated_at?: string
          confianca?: number
          dimension_scores?: Json
          fator_principal?: string | null
          fatores_negativos?: Json
          fatores_positivos?: Json
          group_id: string
          id?: string
          nps_categoria?: string
          nps_score?: number
          recomendacao?: string | null
          score_anterior?: number | null
          tendencia?: string | null
        }
        Update: {
          calculated_at?: string
          confianca?: number
          dimension_scores?: Json
          fator_principal?: string | null
          fatores_negativos?: Json
          fatores_positivos?: Json
          group_id?: string
          id?: string
          nps_categoria?: string
          nps_score?: number
          recomendacao?: string | null
          score_anterior?: number | null
          tendencia?: string | null
        }
        Relationships: []
      }
      nps_surveys: {
        Row: {
          comment: string | null
          communication_rating: string | null
          created_at: string
          group_id: string
          id: string
          improvement_comment: string | null
          manager_rating: string | null
          quality_rating: string | null
          referral_1_company: string | null
          referral_1_contact: string | null
          referral_1_name: string | null
          referral_2_company: string | null
          referral_2_contact: string | null
          referral_2_name: string | null
          referral_3_company: string | null
          referral_3_contact: string | null
          referral_3_name: string | null
          respondent_email: string | null
          respondent_name: string | null
          results_rating: string | null
          score: number
          survey_type: string
        }
        Insert: {
          comment?: string | null
          communication_rating?: string | null
          created_at?: string
          group_id: string
          id?: string
          improvement_comment?: string | null
          manager_rating?: string | null
          quality_rating?: string | null
          referral_1_company?: string | null
          referral_1_contact?: string | null
          referral_1_name?: string | null
          referral_2_company?: string | null
          referral_2_contact?: string | null
          referral_2_name?: string | null
          referral_3_company?: string | null
          referral_3_contact?: string | null
          referral_3_name?: string | null
          respondent_email?: string | null
          respondent_name?: string | null
          results_rating?: string | null
          score: number
          survey_type?: string
        }
        Update: {
          comment?: string | null
          communication_rating?: string | null
          created_at?: string
          group_id?: string
          id?: string
          improvement_comment?: string | null
          manager_rating?: string | null
          quality_rating?: string | null
          referral_1_company?: string | null
          referral_1_contact?: string | null
          referral_1_name?: string | null
          referral_2_company?: string | null
          referral_2_contact?: string | null
          referral_2_name?: string | null
          referral_3_company?: string | null
          referral_3_contact?: string | null
          referral_3_name?: string | null
          respondent_email?: string | null
          respondent_name?: string | null
          results_rating?: string | null
          score?: number
          survey_type?: string
        }
        Relationships: []
      }
      pending_demand_resolutions: {
        Row: {
          created_at: string
          due_date: string | null
          group_id: string
          id: string
          requested_at: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          status: string
          term: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          group_id: string
          id?: string
          requested_at: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          term: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          group_id?: string
          id?: string
          requested_at?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          term?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          group_id: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          group_id?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          group_id?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_feedback_log: {
        Row: {
          category: string
          created_at: string
          extracted_action: string | null
          group_id: string | null
          group_name: string | null
          id: string
          member_name: string
          message: string
          relevance: string
        }
        Insert: {
          category?: string
          created_at?: string
          extracted_action?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          member_name: string
          message: string
          relevance?: string
        }
        Update: {
          category?: string
          created_at?: string
          extracted_action?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          member_name?: string
          message?: string
          relevance?: string
        }
        Relationships: []
      }
      whatsapp_conversas: {
        Row: {
          created_at: string
          dados_extras: Json | null
          direcao: string | null
          group_id: string | null
          id: string
          mensagem: string | null
          nome_contato: string | null
          recebido_em: string
          status: string | null
          telefone: string | null
        }
        Insert: {
          created_at?: string
          dados_extras?: Json | null
          direcao?: string | null
          group_id?: string | null
          id?: string
          mensagem?: string | null
          nome_contato?: string | null
          recebido_em?: string
          status?: string | null
          telefone?: string | null
        }
        Update: {
          created_at?: string
          dados_extras?: Json | null
          direcao?: string | null
          group_id?: string | null
          id?: string
          mensagem?: string | null
          nome_contato?: string | null
          recebido_em?: string
          status?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      whatsapp_grupos: {
        Row: {
          acessos_cliente: string | null
          ad_account_id: string | null
          aniversario_cliente: string | null
          aniversario_empresa: string | null
          briefing: string | null
          categoria: string | null
          created_at: string
          data_ciclo_ads: string | null
          data_entrada: string | null
          estrelas_dificuldade: number | null
          estrelas_financeiro: number | null
          estrelas_temperamento: number | null
          gestor_responsavel: string | null
          group_id: string
          id: string
          investimento_ads: number | null
          nome: string
          plano: string | null
          responsavel_master: string | null
          responsavel_socio: string | null
        }
        Insert: {
          acessos_cliente?: string | null
          ad_account_id?: string | null
          aniversario_cliente?: string | null
          aniversario_empresa?: string | null
          briefing?: string | null
          categoria?: string | null
          created_at?: string
          data_ciclo_ads?: string | null
          data_entrada?: string | null
          estrelas_dificuldade?: number | null
          estrelas_financeiro?: number | null
          estrelas_temperamento?: number | null
          gestor_responsavel?: string | null
          group_id: string
          id?: string
          investimento_ads?: number | null
          nome: string
          plano?: string | null
          responsavel_master?: string | null
          responsavel_socio?: string | null
        }
        Update: {
          acessos_cliente?: string | null
          ad_account_id?: string | null
          aniversario_cliente?: string | null
          aniversario_empresa?: string | null
          briefing?: string | null
          categoria?: string | null
          created_at?: string
          data_ciclo_ads?: string | null
          data_entrada?: string | null
          estrelas_dificuldade?: number | null
          estrelas_financeiro?: number | null
          estrelas_temperamento?: number | null
          gestor_responsavel?: string | null
          group_id?: string
          id?: string
          investimento_ads?: number | null
          nome?: string
          plano?: string | null
          responsavel_master?: string | null
          responsavel_socio?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
