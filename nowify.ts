////////////////////////////////////////////////////////////////////////////////
// import { readKeypress } from "https://deno.land/x/keypress@0.0.11/mod.ts";
//
// import { serve } from "https://deno.land/std@0.191.0/http/server.ts";

import { Database } from "bun:sqlite";
import Minimist from 'minimist';

////////////////////////////////////////////////////////////////////////////////

const {
  _: args,
  help,
  routines: csv,
  db: sqliteFile,
} = Minimist(Bun.argv.slice(2), {
  default: {
    help: false,
    routines: `~/.config/nowify/routines.csv`,
    db: `nowify.db`, // TODO: Where is the best place to store this by default?
  },
  boolean: ["help"],
  string: ["routines", "db"],
  alias: { h: "help" },
});

const command = args.join(` `).trim();
console.log(command);

////////////////////////////////////////////////////////////////////////////////

const db = new Database(sqliteFile);

db.query(`
  create table if not exists log
  ( created_at timestamp not null default current_timestamp
  , event text not null check (event <> '')
  , action text not null check (action in ('start','skip','wait','done'))
  )
`).run();
db.query(`
  create index if not exists log_idx on log
  ( created_at
  , action
  )
`).run();
//
// // https://stackoverflow.com/a/8497474
// const csvLine = (x: string) => {
//   const re_valid =
//     /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
//   const re_value =
//     /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
//   if (!re_valid.test(x)) return null;
//   const a = [];
//   x.replace(re_value, (_, m1, m2, m3) => {
//     // Remove backslash from \' in single quoted values.
//     if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
//     // Remove backslash from \" in double quoted values.
//     else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
//     else if (m3 !== undefined) a.push(m3);
//     return ""; // Return empty string.
//   });
//   // Handle special case of empty last value.
//   if (/,\s*$/.test(x)) a.push("");
//   return a;
// };
//
// const routines = [];
// {
//   const [head, ...body] = (
//     await Deno.readTextFile(csv.replace(`~`, Deno.env.get("HOME") ?? `~`))
//   ).split("\n");
//   const keys = csvLine(head) ?? [];
//   for (const k of [
//     "days",
//     "start",
//     "end",
//     "duration",
//     "score",
//     "event",
//     "desc",
//   ])
//     if (!keys.includes(k))
//       throw Error(`routines.csv must include header row with a '${k}' column.`);
//   for await (const routine of body) {
//     const values = csvLine(routine) ?? [];
//     if (values.length)
//       routines.push(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
//   }
// }
//
// const routinesKeys = ["id", ...Object.keys(routines?.[0] ?? {})]; // TODO: kludge
// const routinesVals = routines.map((o: Record<string, unknown>, id) =>
//   routinesKeys.map(k => `'${{ id, ...o }[k]}'`)
// );
// const routinesVals_ = routinesVals.map(x => `(${x.join(",")})`).join(",");

const start = (): { event: string; desc: string } | null => {
  // @ts-ignore
  const [[event, desc, isStart] = []]: [string?, string?, boolean?][] =
    db.query(`
    with r (${routinesKeys.join(",")}) as (values ${routinesVals_})
    select r.event, r.desc, l.action is not null
    from r
    left join log l on l.event = r.event and l.action = 'start'
    where cast(strftime('%H', datetime(current_timestamp,'localtime')) as integer) between r.start and r.end
      and 0 < instr(days, case strftime('%w',datetime(current_timestamp,'localtime')) when '0' then 'U' when '1' then 'M' when '2' then 'T' when '3' then 'W' when '4' then 'R' when '5' then 'F' when '6' then 'A' end)
      and r.event not in (
        select event
        from log
        where created_at > datetime(current_timestamp, 'start of day', 'localtime')
          and (action = 'done' or action = 'skip' and created_at > datetime(current_timestamp,'-40 minutes'))
      )
    order by l.created_at asc nulls last, r.id asc
    limit 1
  `).get() ?? [];
  if (!event || !desc) return null;
  if (!isStart) {
    db.query(`insert into log (event, action) values (?, 'start')`).all(event as string);
  }
  return { event, desc };
};

const colors = {
  red: (s: string | null) => s && `\u001b[31m${s ?? ``}\u001b[39m`,
  green: (s: string | null) => s && `\u001b[32m${s ?? ``}\u001b[39m`,
  yellow: (s: string | null) => s && `\u001b[33m${s ?? ``}\u001b[39m`,
};

switch (help ? `help` : command) {
  // case "cli": {
  //   const t = () =>
  //     [
  //       new Date().getHours(),
  //       new Date().getMinutes(),
  //       new Date().getSeconds(),
  //     ].join(":");
  //   const keymap: Record<string, string> = {
  //     d: `done`,
  //     s: `skip`,
  //     w: `wait`,
  //   };
  //   let row = start();
  //   if (!row) break;
  //   console.log(`${colors.yellow(t())} ${row.desc}`);
  //   for await (const keypress of readKeypress()) {
  //     if (keypress.ctrlKey && keypress.key === "c") break;
  //     if (keymap[keypress.key as string]) {
  //       console.log(`${colors.green(keymap[keypress.key as string])}`);
  //       db.query(`insert into log (event, action) values (?, ?)`, [
  //         row.event as string,
  //         keymap[keypress.key as string],
  //       ]);
  //     } else {
  //       console.log(colors.red(`usage: d (done), s (skip), w (wait)`));
  //     }
  //     row = start();
  //     if (!row) break;
  //     console.log(`\n${colors.yellow(t())} ${row.desc}`);
  //   }
  //   break;
  // }
  //
  // case "stats": {
  //   console.log();
  //   const log: string[][] = db.query(`
  //     with r (${routinesKeys.join(",")}) as (values ${routinesVals_})
  //     select datetime(created_at,'localtime'), coalesce(score,1) as score
  //     from log l
  //     left join r on l.event = r.event
  //     where l.action = 'done'
  //     and 90 > julianday('now') - julianday(l.created_at)
  //   `);
  //   const stats: number[][] = new Array(48)
  //     .fill(null)
  //     .map(() => new Array(61).fill(0));
  //   const now = new Date().getTime();
  //   for (const [t_, score] of log) {
  //     const t = new Date(t_);
  //     const daysAgo = Math.floor((now - t.getTime()) / (24 * 60 * 60 * 1000));
  //     // TODO: do from midnight instead
  //     const halfhours = Math.floor(
  //       2 * t.getHours() + (t.getMinutes() >= 30 ? 1 : 0)
  //     );
  //     stats[halfhours][daysAgo] = parseInt(score);
  //   }
  //   for (const halfhours in stats)
  //     console.log(
  //       (parseInt(halfhours) % 2 === 0
  //         ? `${parseInt(halfhours) / 2}`.padStart(2, "0")
  //         : "  ") + " ",
  //       stats[halfhours]
  //         .map(
  //           (_, i) =>
  //             (false ? colors.red : colors.green)(
  //               [null, `░`, `▒`, `▓`, `█`][stats[halfhours][i] ?? 0]
  //             ) ?? (i % 7 === 0 ? colors.yellow(`┊`) : ` `)
  //         )
  //         .join(``)
  //     );
  //   console.log();
  //   break;
  // }
  //
  // case "annoy": {
  //   const { event } = start() ?? {};
  //   if (!event) break;
  //   // TODO: make a different sound if there's nothing started or waited but there's available routines that can be started
  //   const [[overdue_at] = []]: string[][] = db.query(`
  //     with r (${routinesKeys.join(",")}) as (values ${routinesVals_})
  //     select max(datetime(l.created_at,case l.action when 'start' then '+'||coalesce(r.duration,25)||' minutes' when 'wait' then '+10 minutes' end))
  //     from log l
  //     left join r on l.event = r.event
  //     where l.event = '${event}'
  //     and l.action in ('start','wait')
  //   `);
  //   if (new Date().getTime() < new Date(overdue_at).getTime()) break;
  //   // TODO: do something more extreme than a beep if nowify has been ignored for a long time
  //   // TODO: kludge
  //   await Deno.run({
  //     cmd: `afplay -v 5 /System/Library/Sounds/Morse.aiff`.split(` `),
  //   }).status();
  //   break;
  // }

  // case "export":
  //   console.log("created_at, event, action");
  //   for (const row of db.query(`select * from log`)) {
  //     // TODO: this doesn't escape quotes or commas
  //     console.log(row.join(`, `));
  //   }
  //   break;
  //
  // case "import": {
  //   const decoder = new TextDecoder();
  //   let stdin = ``;
  //   for await (const chunk of Deno.stdin.readable) {
  //     stdin += decoder.decode(chunk);
  //   }
  //   for (const line of stdin.split(`\n`))
  //     db.query(
  //       `insert into log (created_at, event, action) values (?, ?, ?)`,
  //       csvLine(line) ?? []
  //     );
  //   break;
  // }

  case "server": {
    console.log('in server branch');
    Bun.serve({
      port: "8000",
      fetch(req : Request): Response {
        const url = new URL(req.url);
        console.log(url);
        const route = url.pathname.slice(1);
        if (route === "event") {
          return Response.json(start(), { status: 200 });
        }
        if (["done", "skip", "wait"].includes(route)) {
          const { event } = start() ?? {};
          if (event) {
            db.query(`insert into log (event, action) values (?, ?)`).all(event, route);
          }
          return new Response(null, { status: 201 });
        }
        return new Response(`not found`, { status: 404 });
      }
    });
    break;
  }

  default:
    console.log(colors.red(`invalid command: "${command}"`));
  // falls through
  case "":
  case "help":
    // TODO
    // TODO: create docs for how to run annoy inline like `watch -n 2 -c deno annoy.ts`
    console.log(["usage blah blah blah"].join(`\n`));
    break;
}

db.close();
