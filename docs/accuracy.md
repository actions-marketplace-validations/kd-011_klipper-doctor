# How often it helps

This was measured in November 2026 on real logs, with the rules as they are in 0.5.0. The logs stay out of this repo because they are other people's, so you can't rerun it from here.

## The logs

There were 292 files attached to help threads on the [Klipper forum](https://klipper.discourse.group/c/general-discussion/6), one per thread, from threads dated September 2025 to November 2026. The threads are ones that mentioned `klippy` in their first post. There are also 38 logs from public GitHub repos, one per repo, which are mostly config backups and so mostly healthy.

The forum sample is the fairer test, but it is not a sample of everyone's logs. Those people had a problem and asked for help.

## What it said, counted by script

| What the report led with | Forum (292) | GitHub (38) |
| --- | --- | --- |
| A named cause in the last session | 85 (29%) | 8 (21%) |
| A warning in the last session: a command error, or Klipper still trying to connect | 51 (17%) | 9 (24%) |
| A failure in an earlier session of the same file | 74 (25%) | 4 (11%) |
| A command error in an earlier session | 8 (3%) | 0 |
| A shutdown no rule knows, shown as the raw message with no advice | 13 (4%) | 1 (3%) |
| No failure found | 47 (16%) | 15 (39%) |
| The file was not a klippy.log | 14 (5%) | 1 (3%) |

Whether the specific thing was the right thing takes reading the threads, which is the next section.

## Was it the right answer?

An AI model read 40 forum threads, picked by hash from threads older than the ones used while building the rules. For each one it compared the report with what the person asked and, where the thread got there, what fixed it. No person has second-checked the scoring, so treat the split between classes as one reader's judgement.

| Result | Threads |
| --- | --- |
| It named the problem the thread was about | 22 |
| The answer was not something a log rule could give: print quality, config how-to, a question | 13 |
| The attachment was not a klippy.log | 2 |
| The log held the evidence and it missed it, or led with the wrong session | 3 |
| It stated something the thread contradicted | 0 |

On the 38 real logs it named the problem 22 times (58%). In the 25 threads where the log held the answer, it got 22.

Those 40 were scored before the last two fixes in 0.5.0, and they are what prompted them. One thread's log ended while Klipper was still retrying the connection, which the report called no failure. Another log began mid-run, which merged two sessions and put the older error first. With those fixed the same 40 score 24, 13, 2 and 1, but that later score is on threads already seen, so 22 is the number to trust. The one left is a print that never started because the hotend could not settle at its target temperature, which you can see in a graph and no rule here reads.

An earlier batch of 40 threads, scored on an earlier build, went 17, 17, 3 and 3. All three misses asked why Klipper said an MCU "has deprecated code", which is why the `mcu-version-differs` note exists.

## What counts as named

The report led with, or clearly stated, the thing the thread was about. The fix text may still not have solved it. The "Unable to connect" advice is the same whether the real answer was a wrong path, a bad cable or firmware built for the wrong chip, and forum helpers often got further than that from the same log. Raw reasons count as named too, such as a Python traceback from a third-party module, even though they come with no advice.

## False alarms on configs

No config rule at error level fired on any of the 330 logs, apart from Klipper's own rejection of a config. Those configs ran on real printers, so an error there would have been a false alarm. `unusable-input` did fire, on files that really were not logs.

The notes fire often: `mcu-version-differs` on 161 of the 292 forum logs and `no-input-shaper` on 97. Both are true, and usually not what the person came for.

## Speed

The largest log was 152 MB and took about 310 ms in `analyze()`. The slowest took 386 ms.
