import readline from "readline";

let rl: readline.Interface | null = null;
let shuttingDown = false;

// Lines are queued as they arrive rather than read via rl.question(), which
// only captures the *next* line emitted after it is called. A piped stdin emits
// every line at once, so anything not currently being awaited would be dropped
// and the wizard would stall on question two.
const queue: string[] = [];
let waiter: ((line: string) => void) | null = null;

// Terminal mode only when stdin really is a TTY. Forcing it on makes readline
// treat a redirected stdin as raw keystrokes — the whole buffer echoes at once.
const isTty = Boolean(process.stdin.isTTY);

function getRl(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: isTty,
    });
    rl.on("line", (line) => {
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve(line);
      } else {
        queue.push(line);
      }
    });
    rl.on("close", () => {
      if (waiter && !shuttingDown) {
        console.log("Input losed, aborting \n");
        process.exit(130);
      }
    });
  }
  return rl;
}
export function closePrompts(): void {
  shuttingDown = true;
  if (rl) {
    rl.close();
    rl = null;
  }
}
function readAline(): Promise<string> {
  getRl();
  const queued = queue.shift();
  if (queued !== undefined) return Promise.resolve(queued);
  return new Promise((resolve) => {
    waiter = resolve;
  });
}

export async function ask(prompt: string, fallback = ""): Promise<string> {
  process.stdout.write(prompt);
  const answer = (await readAline()).trim();
  if (!isTty) process.stdout.write(`${answer}\n`);
  return answer.length > 0 ? answer : fallback;
}

export async function askHidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  if (!isTty) {
    const answer = await readAline();
    process.stdout.write("\n");
    return answer.trim();
  }
  const r = getRl() as unknown as {
    _writetoOutput?: ((s: string) => void) | undefined;
  };
  const original = r._writetoOutput;
  r._writetoOutput = () => {};
  try {
    return (await readAline()).trim();
  } finally {
    r._writetoOutput = original;
    process.stdout.write("\n");
  }
}

export async function askNumber(question: string, fallback: number, options: { minimum?: number, maximum?: number }) : Promise<number>{
  const { minimum=-Infinity, maximum= Infinity } = options;
  for(;;) {
    const raw = await ask(question, String(fallback));
    const n = Number(raw);
    if (Number.isFinite(n) && n >= minimum && n <= maximum) return n;
    console.log(`wrong input, should be between ${minimum} & ${maximum}`);
  }
} 

export async function askText(question: string, fallback = "") {
   return ask(question, fallback);
}