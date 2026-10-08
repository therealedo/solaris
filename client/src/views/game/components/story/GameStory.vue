<template>
  <div class="menu-page container">
    <menu-title
      title="Story of the Game"
      @onCloseRequested="onCloseRequested"
    />

    <loading-spinner :loading="isLoading" />

    <p v-if="error" class="text-danger mt-2">{{ error }}</p>

    <template v-if="story">
      <p class="mt-2 mb-1">
        <span v-if="story.winnerAlias">
          <strong>{{ story.winnerAlias }}</strong> won after
          {{ story.endTick }} ticks.
        </span>
        <span v-else>The game ended after {{ story.endTick }} ticks.</span>
        <span v-if="difficultyText"> AI difficulty: {{ difficultyText }}.</span>
      </p>

      <h5 class="mt-3">Turning Points</h5>
      <p v-if="!story.timeline.length" class="text-muted">
        No turning points were recorded for this game.
      </p>
      <ul class="list-unstyled timeline">
        <li
          v-for="(entry, index) in story.timeline"
          :key="index"
          class="timeline-entry"
          :class="'timeline-' + entry.kind"
        >
          <span class="text-muted tick">Tick {{ entry.tick }}</span>
          <i class="fas me-1" :class="iconFor(entry.kind)"></i>
          {{ entry.text }}
        </li>
      </ul>

      <h5 class="mt-3">Your Opponents Revealed</h5>
      <div
        v-for="opponent in story.opponents"
        :key="opponent.playerId"
        class="opponent mb-3"
      >
        <h6 class="mb-1">
          <a
            href="javascript:;"
            @click="onOpenPlayerDetailRequested(opponent.playerId)"
            >{{ opponent.alias }}</a
          >
          <span class="text-warning"> &mdash; {{ opponent.personaTitle }}</span>
          <span v-if="opponent.defeated" class="text-muted"> (defeated)</span>
        </h6>
        <p class="mb-1 small">{{ opponent.personaDescription }}</p>
        <p class="mb-2">
          <strong>Secret goal:</strong>
          {{ opponent.agenda ? capitalise(opponent.agenda) + "." : "None." }}
        </p>

        <div class="row">
          <div class="col-12 col-md-6">
            <p class="mb-1"><strong>What they told you</strong></p>
            <p v-if="!opponent.messagesToYou.length" class="text-muted small">
              They never wrote to you.
            </p>
            <ul class="list-unstyled small">
              <li
                v-for="(message, index) in opponent.messagesToYou"
                :key="index"
                class="mb-1"
              >
                <span class="text-muted" v-if="message.tick != null"
                  >Tick {{ message.tick }}:
                </span>
                "{{ message.message }}"
              </li>
            </ul>
          </div>
          <div class="col-12 col-md-6">
            <p class="mb-1"><strong>What they planned</strong></p>
            <p v-if="!opponent.notes.length" class="text-muted small">
              They kept no notes.
            </p>
            <ul class="list-unstyled small">
              <li
                v-for="(note, index) in opponent.notes"
                :key="index"
                class="mb-1"
              >
                {{ note }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import MenuTitle from "../MenuTitle.vue";
import LoadingSpinner from "../../../components/LoadingSpinner.vue";
import { useGameStore } from "@/stores/game";
import { getGameStory } from "@/services/typedapi/game";
import {
  extractErrors,
  formatError,
  httpInjectionKey,
  isOk,
} from "@/services/typedapi";
import type { GameStory, GameStoryEntryKind } from "@solaris/common";
import { computed, inject, onMounted, ref, type Ref } from "vue";

const emit = defineEmits<{
  onCloseRequested: [e: Event];
  onOpenPlayerDetailRequested: [playerId: string];
}>();

const store = useGameStore();
const httpClient = inject(httpInjectionKey)!;

const isLoading = ref(false);
const error: Ref<string | null> = ref(null);
const story: Ref<GameStory<string> | null> = ref(null);

const ICONS: Record<GameStoryEntryKind, string> = {
  gameStarted: "fa-flag",
  allianceFormed: "fa-handshake",
  allianceBroken: "fa-handshake-slash",
  warDeclared: "fa-fist-raised",
  peaceMade: "fa-dove",
  homeStarCaptured: "fa-home",
  battle: "fa-crosshairs",
  playerDefeated: "fa-skull-crossbones",
  playerAfk: "fa-user-slash",
  gameEnded: "fa-trophy",
};

const iconFor = (kind: GameStoryEntryKind) => ICONS[kind] ?? "fa-circle";

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const difficultyText = computed(() =>
  story.value?.aiDifficulty ? capitalise(story.value.aiDifficulty) : null,
);

const onCloseRequested = (e: Event) => emit("onCloseRequested", e);
const onOpenPlayerDetailRequested = (playerId: string) =>
  emit("onOpenPlayerDetailRequested", playerId);

const loadStory = async () => {
  isLoading.value = true;
  error.value = null;

  const response = await getGameStory(httpClient)(store.game!._id);

  if (isOk(response)) {
    story.value = response.data;
  } else {
    error.value =
      extractErrors(response)[0] ?? "The story of this game is not available.";
    console.error(formatError(response));
  }

  isLoading.value = false;
};

onMounted(() => {
  loadStory();
});
</script>

<style scoped>
.timeline-entry {
  padding: 2px 0;
}

.tick {
  display: inline-block;
  min-width: 70px;
}

.timeline-allianceBroken,
.timeline-warDeclared,
.timeline-playerDefeated {
  color: #f08080;
}

.timeline-allianceFormed,
.timeline-peaceMade {
  color: #90ee90;
}

.timeline-gameEnded {
  color: #efbf04;
  font-weight: bold;
}

.opponent {
  border-top: 1px solid #444;
  padding-top: 8px;
}
</style>
