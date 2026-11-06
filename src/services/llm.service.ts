import { supabase } from "@/utils/supabase/client";
import LlmModel from "@/types/llm-model";
import LlmInputType from "@/types/llm-input-type";
import LlmOutputType from "@/types/llm-output-type";

export class LlmService {
  static async getAllModels(): Promise<LlmModel[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from("llm_models").select("*");
      if (error) {
        console.error("Error fetching llm models:", error);
        return [];
      }
      return (data || []) as LlmModel[];
    } catch (error) {
      console.error("Error fetching llm models:", error);
      return [];
    }
  }

  static async getAllInputTypes(): Promise<LlmInputType[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from("llm_input_types").select("*");
      if (error) {
        console.error("Error fetching llm input types:", error);
        return [];
      }
      return (data || []) as LlmInputType[];
    } catch (error) {
      console.error("Error fetching llm input types:", error);
      return [];
    }
  }

  static async getAllOutputTypes(): Promise<LlmOutputType[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from("llm_output_types").select("*");
      if (error) {
        console.error("Error fetching llm output types:", error);
        return [];
      }
      return (data || []) as LlmOutputType[];
    } catch (error) {
      console.error("Error fetching llm output types:", error);
      return [];
    }
  }

  static async getInputTypesByIds(typeIds: Array<number | string>): Promise<LlmInputType[]> {
    if (!supabase) return [];
    const normalizedIds = Array.from(new Set(typeIds))
      .map((id) => (typeof id === "number" ? id : Number.parseInt(id, 10)))
      .filter((id): id is number => Number.isFinite(id));
    if (normalizedIds.length === 0) return [];
    try {
      const { data, error } = await supabase
        .from("llm_input_types")
        .select("*")
        .in("id", normalizedIds);
      if (error) {
        console.error("Error fetching llm input types by ids:", error);
        return [];
      }
      return (data || []) as LlmInputType[];
    } catch (error) {
      console.error("Error fetching llm input types by ids:", error);
      return [];
    }
  }

  static async getOutputTypesByIds(typeIds: Array<number | string>): Promise<LlmOutputType[]> {
    if (!supabase) return [];
    const normalizedIds = Array.from(new Set(typeIds))
      .map((id) => (typeof id === "number" ? id : Number.parseInt(id, 10)))
      .filter((id): id is number => Number.isFinite(id));
    if (normalizedIds.length === 0) return [];
    try {
      const { data, error } = await supabase
        .from("llm_output_types")
        .select("*")
        .in("id", normalizedIds);
      if (error) {
        console.error("Error fetching llm output types by ids:", error);
        return [];
      }
      return (data || []) as LlmOutputType[];
    } catch (error) {
      console.error("Error fetching llm output types by ids:", error);
      return [];
    }
  }

}
