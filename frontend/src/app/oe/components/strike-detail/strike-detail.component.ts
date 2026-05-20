import {
  Block,
  BlockSpanTimeStrike,
  BlockSpanTimeStrikeGuessesSummary,
  BlockTimeStrikeGuessPublic,
  PaginationResponse,
} from '../../interfaces/oe-energy.interface';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { Subscription, of, combineLatest } from 'rxjs';
import { switchMap, catchError, map, take } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { BlockTypes } from '../../types/constant';
import {
  OeEnergyApiService,
} from '../../services/oe-energy.service';
import { BlockrateTimeStrikeService } from '../../services/blockratetimestrike.service';
import { OeStateService } from '../../services/state.service';

@Component({
  selector: 'app-strike-detail',
  templateUrl: './strike-detail.component.html',
  styleUrls: ['./strike-detail.component.scss'],
})
export class StrikeDetailComponent implements OnInit, OnDestroy {
  network = '';
  fromBlock: Block;
  toBlock: Block | any;
  blockHeight: number;
  nextBlockHeight: number;
  fromBlockHeight: number;
  toBlockHeight: number;
  strike: BlockSpanTimeStrike;
  isLoadingBlock = true;
  latestBlock: Block;
  latestBlocks: Block[] = [];
  isLoadingTransactions = true;
  error: any;
  itemsPerPage: number;
  showPreviousBlocklink = true;
  showNextBlocklink = true;

  subscription: Subscription;
  slowFastGuesses: BlockTimeStrikeGuessPublic[] = [];
  currentActiveGuess: 'slow' | 'fast' | null = null;
  guessesSummary: BlockSpanTimeStrikeGuessesSummary = { fastCount: 0, slowCount: 0 };

  get strikeElapsedTime(): number {
    return this.strike.mediantime - this.fromBlock.mediantime;
  }

  get span(): number {
    return this.toBlock.height - this.fromBlock.height;
  }

  get timeDiff(): number {
    return this.toBlock.mediantime - this.fromBlock.mediantime;
  }

  get energyDiff(): number {
    return ((this.span * 600 - this.timeDiff) / (this.span * 600)) * 100;
  }

  get canGuess(): boolean {
    return (
      this.stateService.latestBlockHeight > 0 &&
      this.strike.block > this.stateService.latestBlockHeight
    );
  }

  get spanWithStrike(): number {
    return this.strike.block - this.fromBlock.height;
  }

  get timeDiffWithStrike(): number {
    return this.strike.mediantime - this.fromBlock.mediantime;
  }

  get energyDiffWithStrike(): number {
    return (
      ((this.spanWithStrike * 600 - this.timeDiffWithStrike) /
        (this.spanWithStrike * 600)) *
      100
    );
  }

  get totalIconCountWithStrike() {
    let count = Math.round((6 + this.energyDiffWithStrike / 5) / 2);
    if (count < 0) {
      count = 0;
    }
    return count;
  }

  get strikeType(): 'Energy' | 'Strike' | 'Strike_Boiling' {
    return this.strike.mediantime > this.toBlock.mediantime
      ? 'Strike_Boiling'
      : 'Strike';
  }

  constructor(
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private oeEnergyApiService: OeEnergyApiService,
    private blockrateTimeStrikeService: BlockrateTimeStrikeService,
    public stateService: OeStateService,
    private oeEnergyStateService: OeStateService
  ) {}

  ngOnInit() {
    this.subscription = this.route.queryParamMap
      .pipe(
        switchMap((params: ParamMap) =>
          this.stateService.latestReceivedBlock$
            .pipe(take(1)) // don't follow any future update of this object
            .pipe(
              switchMap((block: Block) => {
                this.latestBlock = block;
                return of(params);
              })
            )
        )
      )
      .pipe(
        switchMap((params: ParamMap) =>
          this.stateService.latestReceivedBlock$
            .pipe(take(1)) // don't follow any future update of this object
            .pipe(
              switchMap((block: Block) => {
                this.latestBlock = block;
                return of(params);
              })
            )
        )
      )
      .pipe(
        switchMap((params: ParamMap) => {
          const fromBlockHeight =
            +params.get('blockspanStart') || this.latestBlock.height;
          const strikeHeight = +params.get('strikeHeight') || 1200000;
          let strikeTime = +params.get('strikeTime');

          if (!strikeTime) {
            strikeTime =
              this.latestBlock.mediantime +
              (strikeHeight - this.latestBlock.height) * 600;
          }
          this.strike = {
            block: strikeHeight,
            mediantime: strikeTime,
            creationTime: undefined,
            spanSize: 0,
            guessesCount: 0,
          };

          this.fromBlockHeight = fromBlockHeight;
          this.toBlockHeight = strikeHeight;
          this.blockHeight =
            history.state.data?.blockHeight ?? this.blockHeight;

          document.body.scrollTo(0, 0);

          if (history.state.data?.block) {
            this.blockHeight = history.state.data.block.height;
            return of([history.state.data.block, history.state.data.block]);
          }

          this.isLoadingBlock = true;

          const fromBlockInCache = this.latestBlocks.find(
            (block) => block.height === fromBlockHeight
          );
          const toBlockInCache = this.latestBlocks.find(
            (block) => block.height === strikeHeight
          );

          if (fromBlockInCache && toBlockInCache) {
            return of([fromBlockInCache, toBlockInCache]);
          }

          return combineLatest([
            this.oeEnergyApiService
              .$getBlocksByHeights([fromBlockHeight, strikeHeight]),
            this.blockrateTimeStrikeService
              .$strikesWithFilter({
                strikeMediantimeEQ: strikeTime,
                blockHeightEQ: strikeHeight,
              })
              .pipe(catchError(() => of(strikeHeight))),
          ]).pipe(
            map(([blocks, strikes]) => [blocks, strikes] as [Block[], PaginationResponse<BlockSpanTimeStrike> | number])
          );
        })
      )
      .subscribe(
        async (result: any) => {
          const [blocks, strikesDetails] = result as [Block[], PaginationResponse<BlockSpanTimeStrike> | number];
          const [fromBlock, toBlock] = blocks;
          this.fromBlock = fromBlock;
          this.toBlock =
            typeof toBlock === BlockTypes.NUMBER
              ? { height: +toBlock }
              : toBlock;
          this.blockHeight = fromBlock.height;
          this.nextBlockHeight = fromBlock.height + 1;
          this.setNextAndPreviousBlockLink();

          // Type guard: check if strikesDetails is a PaginationResponse
          if (typeof strikesDetails === 'number') {
            this.toastr.error('Strikes Not Found!', 'Failed!');
            this.isLoadingBlock = false;
            return;
          }

          const strikesResult = strikesDetails.results;
          if (!strikesResult.length) {
            this.toastr.error('Strikes Not Found!', 'Failed!');
            this.isLoadingBlock = false;
            return;
          }

          this.strike = strikesResult[0];

          this.fetchGuessesSummary();
          this.isLoadingBlock = false;
        },
        (error) => {
          this.error = error;
          this.isLoadingBlock = false;
        }
      );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  setNextAndPreviousBlockLink() {
    if (this.latestBlock && this.blockHeight) {
      if (this.blockHeight === 0) {
        this.showPreviousBlocklink = false;
      } else {
        this.showPreviousBlocklink = true;
      }
      if (
        this.latestBlock.height &&
        this.latestBlock.height === this.blockHeight
      ) {
        this.showNextBlocklink = false;
      } else {
        this.showNextBlocklink = true;
      }
    }
  }

  getHexValue(str) {
    const arr1 = str.split('');
    const idx = arr1.findIndex((a) => a !== '0');
    let hexValue = '0x';
    if (idx > -1) {
      hexValue += str.slice(idx);
    } else {
      hexValue += str;
    }
    return hexValue;
  }

  guess(guess: 'slow' | 'fast') {
    this.currentActiveGuess = guess;
    this.blockrateTimeStrikeService
      .$strikeGuess(
        this.strike.block,
        this.strike.mediantime,
        guess
      )
      .subscribe((slowFastGuess: BlockTimeStrikeGuessPublic) => {
        this.slowFastGuesses = [...this.slowFastGuesses, slowFastGuess];
        this.toastr.success('Guessed successfully!', 'Success!');
      });
  }

  energyDetailLink() {
    return `/hashstrikes/blockrate-detail/${this.fromBlock.height}/${this.toBlock.height}`;
  }

  strikeSummaryLink() {
    return `/hashstrikes/blockrate-strike-summary?strikeHeight=${this.strike.block}&strikeTime=${this.strike.mediantime}&blockspanStart=${this.fromBlock.height}`;
  }

  private fetchGuessesSummary(): void {
    this.blockrateTimeStrikeService
      .$getStrikeGuessesSummary(this.strike.block, this.strike.mediantime)
      .pipe(catchError(() => of({ fastCount: 0, slowCount: 0 })))
      .subscribe((summary: BlockSpanTimeStrikeGuessesSummary) => {
        this.guessesSummary = summary;
      });
  }

  private handleError(error: any): void {
    this.toastr.error(`Strikes Failed To Fetch: ${error.error}`, 'Failed!');
  }
}
