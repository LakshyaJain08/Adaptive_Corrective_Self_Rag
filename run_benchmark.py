import time
import os
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.progress import track
import tiktoken

from acsrag.graphs.phase8_iterative import build_phase8_graph

# Ragas imports
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

console = Console()

# Example test queries covering different intents
TEST_QUERIES = [
    "According to the company's leave and work-from-home policies, how do our employee benefits compare to the latest 2024 Remote Work policies adopted by Microsoft, and what impact does our product pricing structure have on our own remote employees?",
    "Compare the company's leave policy with the regularization techniques in neural networks."
]

def estimate_cost(text, is_output=False):
    """Estimate token cost based on Gemini 1.5 Flash pricing."""
    if not text:
        return 0.0
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        num_tokens = len(enc.encode(str(text)))
    except Exception:
        num_tokens = len(str(text)) // 4
        
    if is_output:
        # Gemini 1.5 Flash approx cost: $0.30 per 1M output tokens
        return num_tokens * 0.00000030
    else:
        # Gemini 1.5 Flash approx cost: $0.075 per 1M input tokens
        return num_tokens * 0.000000075

def main():
    console.print("[bold green]Building ACSRAG Phase 8 Graph...[/bold green]")
    
    # Use the sample data dir
    data_dir = Path("acsrag/documents")
    pdf_paths = list(data_dir.glob("*.pdf"))
    if not pdf_paths:
        console.print("[yellow]Warning: No PDFs found in 'data/' directory. Proceeding with empty internal knowledge.[/yellow]")
    
    graph = build_phase8_graph(pdf_paths)
    
    results = []
    ragas_data = {
        "question": [],
        "answer": [],
        "contexts": [],
    }
    
    console.print("\n[bold blue]Running Benchmark...[/bold blue]\n")
    
    for query in track(TEST_QUERIES, description="Processing queries..."):
        start_time = time.time()
        
        # Initialize state
        initial_state = {
            "question": query,
            "iterations": 0,
            "rewrite_tries": 0,
            "retries": 0,
        }
        
        try:
            final_state = graph.invoke(initial_state)
            latency = time.time() - start_time
            
            # Extract metrics
            answer = final_state.get("answer", "No answer generated.")
            iterations = final_state.get("iterations", 0)
            
            conf_scores = final_state.get("confidence_scores", {})
            overall_conf = conf_scores.get("overall_confidence", 0.0)
            
            intent = final_state.get("intent", "UNKNOWN")
            context = final_state.get("context", "")
            
            # Estimate Costs
            input_cost = estimate_cost(query + context, is_output=False)
            output_cost = estimate_cost(answer, is_output=True)
            total_cost = input_cost + output_cost
            
            results.append({
                "query": query,
                "intent": intent,
                "latency": f"{latency:.2f}s",
                "iterations": iterations,
                "confidence": f"{overall_conf:.2f}",
                "cost": f"${total_cost:.5f}",
                "answer": answer.replace('\n', ' ')[:100] + "..."
            })
            
            # Prepare Ragas data
            ragas_data["question"].append(query)
            ragas_data["answer"].append(answer)
            ragas_data["contexts"].append([context] if context else ["No context provided"])
            
        except Exception as e:
            results.append({
                "query": query,
                "intent": "ERROR",
                "latency": f"{time.time() - start_time:.2f}s",
                "iterations": "-",
                "confidence": "-",
                "cost": "-",
                "answer": f"ERROR: {str(e)}"
            })
            ragas_data["question"].append(query)
            ragas_data["answer"].append("ERROR")
            ragas_data["contexts"].append([""])

    # 3. Ragas Evaluation
    console.print("\n[bold blue]Running Ragas Evaluation (Faithfulness, Answer Relevancy)...[/bold blue]\n")
    try:
        dataset = Dataset.from_dict(ragas_data)
        
        # Initialize Gemini for Ragas
        llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")
        embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
        
        # Evaluate
        ragas_results = evaluate(
            dataset,
            metrics=[faithfulness, answer_relevancy],
            llm=llm,
            embeddings=embeddings,
        )
        
        ragas_df = ragas_results.to_pandas()
        
        # Merge back to results
        for i, r in enumerate(results):
            if r["intent"] != "ERROR":
                r["faithfulness"] = f"{ragas_df.iloc[i]['faithfulness']:.2f}" if not os.environ.get('RAGAS_MOCK') else "N/A"
                r["answer_relevancy"] = f"{ragas_df.iloc[i]['answer_relevancy']:.2f}" if not os.environ.get('RAGAS_MOCK') else "N/A"
            else:
                r["faithfulness"] = "-"
                r["answer_relevancy"] = "-"
                
    except Exception as e:
        console.print(f"[bold red]Ragas evaluation failed: {e}[/bold red]")
        for r in results:
            r["faithfulness"] = "Error"
            r["answer_relevancy"] = "Error"

    # 1. Print Rich Table to Console
    table = Table(title="ACSRAG Benchmark Results")
    table.add_column("Query", style="cyan", max_width=30)
    table.add_column("Intent", style="magenta")
    table.add_column("Latency", justify="right", style="green")
    table.add_column("Cost", justify="right", style="yellow")
    table.add_column("Conf.", justify="right")
    table.add_column("Faithful", justify="right")
    table.add_column("Relevant", justify="right")
    table.add_column("Answer Snippet", style="dim", max_width=40)

    for r in results:
        table.add_row(
            r["query"], r["intent"], r["latency"], r.get("cost", "-"),
            str(r["confidence"]), str(r.get("faithfulness", "-")), 
            str(r.get("answer_relevancy", "-")), r["answer"]
        )

    console.print(table)
    
    # 2. Save Markdown Report
    report_path = "benchmark_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# ACSRAG Benchmark Report\n\n")
        f.write("| Query | Intent | Latency | Cost | Confidence | Faithfulness | Relevancy | Answer Snippet |\n")
        f.write("|---|---|---|---|---|---|---|---|\n")
        for r in results:
            f.write(f"| {r['query']} | {r['intent']} | {r['latency']} | {r.get('cost', '-')} | {r['confidence']} | {r.get('faithfulness', '-')} | {r.get('answer_relevancy', '-')} | {r['answer']} |\n")
            
    console.print(f"\n[bold green]Report saved to {report_path}[/bold green]")

if __name__ == "__main__":
    main()
