<template>
  <div class="row victoryBox">
    <div class="col text-center pt-2">
      <h3 class="text-info victoryHeading">Game Complete</h3>
      <img :src="victory" alt="Victory" class="victoryImg mb-4" />
      <p class="text-info victoryWinner" v-if="!isTeamConquest">
        <span class="victoryEmphasis">{{ getWinnerAlias() }}</span> has
        conquered the galaxy!
      </p>
      <p class="text-info victoryWinner" v-if="isTeamConquest">
        <span class="victoryEmphasis">{{ getWinningTeam() }}</span> has
        conquered the galaxy!
      </p>
      <p v-if="hasStory">
        <button class="btn btn-sm btn-outline-info" @click="openStory">
          <i class="fas fa-book-open"></i> Read the Story of the Game
        </button>
      </p>
    </div>
  </div>

  <hr />
</template>

<script setup lang="ts">
import victory from "@/assets/general/laurel_wreath.svg";
import GameHelper from "@/services/gameHelper";
import type { Game } from "@/types/game";
import { computed } from "vue";
import { useGameStore } from "@/stores/game";

const props = defineProps<{
  game: Game;
}>();

const store = useGameStore();

const isTeamConquest = computed(() => GameHelper.isTeamConquest(props.game));

// Players of games with AI opponents can see what the AI was secretly up to.
const hasStory = computed(
  () =>
    GameHelper.getUserPlayer(props.game) != null &&
    (GameHelper.isSinglePlayerGame(props.game) ||
      (props.game.settings.general.aiOpponents ?? 0) > 0),
);

const openStory = () => store.setMenuState({ state: "gameStory" });

const getWinnerAlias = () =>
  props.game.state.winner &&
  GameHelper.getPlayerById(props.game, props.game.state.winner)?.alias;
const getWinningTeam = () =>
  props.game.state.winningTeam &&
  GameHelper.getTeamById(props.game, props.game.state.winningTeam)?.name;
</script>

<style scoped>
.victoryImg {
  width: 150px;
  height: 150px;
}

.victoryBox {
  border: 2px solid #efbf04;
  margin: 4px;
  border-radius: 4px;
}

.victoryHeading {
  font-size: 28px;
}

.victoryWinner {
  font-size: 22px;
}

.victoryEmphasis {
  font-weight: bold;
}
</style>
