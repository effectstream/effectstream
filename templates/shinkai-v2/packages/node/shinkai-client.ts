interface V2InboxMessage {
  job_message: {
    job_id: string;
    content: string;
    parent: string | null;
    metadata: unknown;
  };
}

export class ShinkaiClient {
  private baseUrl: string;
  private apiKey: string;
  private llmProvider: string;

  constructor(opts?: { url?: string; apiKey?: string; llmProvider?: string }) {
    this.baseUrl = opts?.url ?? process.env.SHINKAI_URL!;
    this.apiKey = opts?.apiKey ?? process.env.SHINKAI_API_KEY!;
    this.llmProvider = opts?.llmProvider ?? process.env.SHINKAI_LLM_PROVIDER ?? "shinkai_free_trial";
    if (!this.baseUrl) throw new Error("SHINKAI_URL is required");
    if (!this.apiKey) throw new Error("SHINKAI_API_KEY is required");
  }

  async askQuestion(question: string): Promise<{ question: string; response: string }> {
    const jobId = await this.createJob();
    const inbox = await this.sendMessage(jobId, question);

    let messages: string[] = [];
    while (messages.length <= 1) {
      await new Promise((r) => setTimeout(r, 1000));
      messages = await this.getMessages(inbox);
    }

    return { question, response: messages[messages.length - 1] };
  }

  async healthCheck(): Promise<{ ready: boolean; version: string }> {
    const res = await this.request("GET", "/v2/health_check");
    return { ready: res.ready, version: res.version };
  }

  private async createJob(): Promise<string> {
    const res = await this.request("POST", "/v2/create_job", {
      llm_provider: this.llmProvider,
      job_creation_info: {
        scope: {
          vector_fs_items: [],
          vector_fs_folders: [],
          network_folders: [],
          local_vrkai: [],
          local_vrpack: [],
        },
        is_hidden: false,
      },
    });
    return res.job_id;
  }

  private async sendMessage(jobId: string, content: string): Promise<string> {
    const res = await this.request("POST", "/v2/job_message", {
      job_message: {
        job_id: jobId,
        content,
        parent: "",
        fs_files_paths: [],
        job_filenames: [],
      },
    });
    return res.inbox;
  }

  private async getMessages(inbox: string): Promise<string[]> {
    const res = await this.request("POST", "/v2/last_messages_with_branches", {
      inbox_name: inbox,
      limit: 10,
    });
    const flat: V2InboxMessage[] = (res as unknown[]).flat() as V2InboxMessage[];
    return flat.map((m) => m.job_message.content);
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shinkai API ${method} ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }
}
