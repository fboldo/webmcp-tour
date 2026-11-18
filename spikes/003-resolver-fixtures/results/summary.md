Corpus: 159 queries on 17 pages. Chromium 141.0.7390.37.

### dev

| variant | pass | rate | wrong_element | silent_pick | false_positive | spurious_ambiguous | false_ambiguous | missed | median ms | max ms |
|---|---|---|---|---|---|---|---|---|---|---|
| plan | 101/118 | 85.6% | 3 | 0 | 1 | 11 | 1 | 1 | 18.4 | 54.8 |
| +labelToControl | 109/118 | 92.4% | 2 | 0 | 1 | 4 | 1 | 1 | 16.9 | 53.0 |
| +preferInteractive | 111/118 | 94.1% | 3 | 0 | 1 | 1 | 1 | 1 | 15.7 | 50.4 |
| +visibleTextToo | 100/118 | 84.7% | 3 | 0 | 1 | 12 | 1 | 1 | 17.2 | 55.3 |
| +strictVisibility | 104/118 | 88.1% | 3 | 0 | 1 | 8 | 1 | 1 | 16.7 | 51.1 |
| +caseTiebreak | 101/118 | 85.6% | 3 | 0 | 1 | 11 | 1 | 1 | 16.1 | 51.0 |
| +substringInteractiveOnly | 103/118 | 87.3% | 3 | 0 | 1 | 10 | 0 | 1 | 15.8 | 50.2 |
| +substringBest2x | 100/118 | 84.7% | 4 | 0 | 1 | 11 | 1 | 1 | 16.6 | 51.6 |
| +opacityFields | 102/118 | 86.4% | 2 | 0 | 1 | 12 | 1 | 0 | 16.0 | 52.1 |
| +leafTabindex | 101/118 | 85.6% | 3 | 0 | 1 | 11 | 1 | 1 | 16.6 | 58.2 |
| recommended-frozen | 116/118 | 98.3% | 1 | 0 | 0 | 1 | 0 | 0 | 16.3 | 53.4 |
| recommended | 116/118 | 98.3% | 1 | 0 | 0 | 1 | 0 | 0 | 16.5 | 52.8 |
| recommended+visibleTextToo+caseTiebreak | 116/118 | 98.3% | 1 | 0 | 0 | 1 | 0 | 0 | 16.6 | 56.5 |

### holdout

| variant | pass | rate | wrong_element | silent_pick | false_positive | spurious_ambiguous | false_ambiguous | missed | median ms | max ms |
|---|---|---|---|---|---|---|---|---|---|---|
| plan | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 6.8 | 35.9 |
| +labelToControl | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 6.5 | 27.8 |
| +preferInteractive | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 6.1 | 29.6 |
| +visibleTextToo | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 9.4 | 29.6 |
| +strictVisibility | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 8.1 | 38.6 |
| +caseTiebreak | 38/41 | 92.7% | 1 | 1 | 1 | 0 | 0 | 0 | 6.8 | 24.7 |
| +substringInteractiveOnly | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 8.6 | 24.7 |
| +substringBest2x | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 6.8 | 24.8 |
| +opacityFields | 39/41 | 95.1% | 1 | 0 | 1 | 0 | 0 | 0 | 6.4 | 31.6 |
| +leafTabindex | 40/41 | 97.6% | 0 | 0 | 1 | 0 | 0 | 0 | 8.3 | 26.1 |
| recommended-frozen | 40/41 | 97.6% | 1 | 0 | 0 | 0 | 0 | 0 | 5.5 | 25.1 |
| recommended | 41/41 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 | 5.6 | 25.2 |
| recommended+visibleTextToo+caseTiebreak | 40/41 | 97.6% | 0 | 1 | 0 | 0 | 0 | 0 | 6.7 | 26.7 |

### all

| variant | pass | rate | wrong_element | silent_pick | false_positive | spurious_ambiguous | false_ambiguous | missed | median ms | max ms |
|---|---|---|---|---|---|---|---|---|---|---|
| plan | 140/159 | 88.1% | 4 | 0 | 2 | 11 | 1 | 1 | 13.9 | 54.8 |
| +labelToControl | 148/159 | 93.1% | 3 | 0 | 2 | 4 | 1 | 1 | 13.7 | 53.0 |
| +preferInteractive | 150/159 | 94.3% | 4 | 0 | 2 | 1 | 1 | 1 | 13.2 | 50.4 |
| +visibleTextToo | 139/159 | 87.4% | 4 | 0 | 2 | 12 | 1 | 1 | 15.2 | 55.3 |
| +strictVisibility | 143/159 | 89.9% | 4 | 0 | 2 | 8 | 1 | 1 | 13.8 | 51.1 |
| +caseTiebreak | 139/159 | 87.4% | 4 | 1 | 2 | 11 | 1 | 1 | 13.4 | 51.0 |
| +substringInteractiveOnly | 142/159 | 89.3% | 4 | 0 | 2 | 10 | 0 | 1 | 13.1 | 50.2 |
| +substringBest2x | 139/159 | 87.4% | 5 | 0 | 2 | 11 | 1 | 1 | 13.1 | 51.6 |
| +opacityFields | 141/159 | 88.7% | 3 | 0 | 2 | 12 | 1 | 0 | 13.1 | 52.1 |
| +leafTabindex | 141/159 | 88.7% | 3 | 0 | 2 | 11 | 1 | 1 | 13.2 | 58.2 |
| recommended-frozen | 156/159 | 98.1% | 2 | 0 | 0 | 1 | 0 | 0 | 13.5 | 53.4 |
| recommended | 157/159 | 98.7% | 1 | 0 | 0 | 1 | 0 | 0 | 13.5 | 52.8 |
| recommended+visibleTextToo+caseTiebreak | 156/159 | 98.1% | 1 | 1 | 0 | 1 | 0 | 0 | 14.9 | 56.5 |
