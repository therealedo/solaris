<template>
  <div class="mb-2">
    <label class="col-form-label"
      >Your Opponents
      <help-tooltip
        tooltip="Pick a persona, name and avatar for each AI opponent, or leave them random. A completely random persona is generated just for that bot: it always plays to win, in its own way. Other players never see these picks."
    /></label>

    <div class="table-responsive">
      <table class="table table-sm mb-1">
        <tbody>
          <tr v-for="(choice, i) in choices" :key="i">
            <td class="align-middle text-muted">{{ i + 1 }}</td>
            <td>
              <select
                class="form-select form-select-sm"
                v-model="choice.persona"
                :disabled="disabled"
                :aria-label="`Persona of AI opponent ${i + 1}`"
              >
                <option
                  v-for="opt in options.general.aiPersona"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.text }}
                </option>
              </select>
            </td>
            <td>
              <input
                type="text"
                class="form-control form-control-sm"
                v-model="choice.alias"
                placeholder="Random name"
                maxlength="24"
                :disabled="disabled"
                :aria-label="`Name of AI opponent ${i + 1}`"
              />
            </td>
            <td>
              <select
                class="form-select form-select-sm"
                v-model="choice.avatar"
                :disabled="disabled"
                :aria-label="`Avatar of AI opponent ${i + 1}`"
              >
                <option :value="null">Random avatar</option>
                <option v-for="a in avatars" :key="a.id" :value="a.id">
                  {{ a.name }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="d-flex flex-wrap gap-1">
      <button
        type="button"
        class="btn btn-sm btn-outline-info"
        :disabled="disabled"
        @click="setAll('random')"
      >
        All completely random
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-info"
        :disabled="disabled"
        @click="reset"
      >
        Reset
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-success"
        :disabled="disabled"
        @click="saveFavourite"
      >
        Save as favourite lobby
      </button>
      <button
        v-if="hasFavourite"
        type="button"
        class="btn btn-sm btn-outline-success"
        :disabled="disabled"
        @click="loadFavourite"
      >
        Load favourite lobby
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, ref, watch, type Ref } from "vue";
import {
  GAME_CREATION_OPTIONS,
  type AiOpponentChoice,
  type UserAvatar,
} from "@solaris/common";
import HelpTooltip from "@/views/components/HelpTooltip.vue";
import { httpInjectionKey, isOk } from "@/services/typedapi";
import { listMyAvatars } from "@/services/typedapi/user";

const FAVOURITE_KEY = "solaris.aiOpponentLobby";

const options = GAME_CREATION_OPTIONS;
const httpClient = inject(httpInjectionKey)!;

const props = defineProps<{
  count: number;
  disabled?: boolean;
}>();

const choices = defineModel<AiOpponentChoice[]>({ required: true });
const avatars: Ref<UserAvatar[]> = ref([]);
const hasFavourite = ref(false);

const blank = (): AiOpponentChoice => ({
  persona: "any",
  alias: "",
  avatar: null,
});

// One row per AI opponent, keeping what was already picked.
const resize = () => {
  const next = choices.value.slice(0, props.count);

  while (next.length < props.count) {
    next.push(blank());
  }

  choices.value = next;
};

const setAll = (persona: string) => {
  choices.value = choices.value.map((c) => ({ ...c, persona }));
};

const reset = () => {
  choices.value = choices.value.map(() => blank());
};

const saveFavourite = () => {
  try {
    localStorage.setItem(FAVOURITE_KEY, JSON.stringify(choices.value));
    hasFavourite.value = true;
  } catch (e) {
    console.error(e);
  }
};

const loadFavourite = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVOURITE_KEY) || "[]");

    if (Array.isArray(saved)) {
      choices.value = saved.map((c) => ({ ...blank(), ...c }));
      resize();
    }
  } catch (e) {
    console.error(e);
  }
};

watch(() => props.count, resize);

onMounted(async () => {
  resize();

  try {
    hasFavourite.value = Boolean(localStorage.getItem(FAVOURITE_KEY));
  } catch {
    hasFavourite.value = false;
  }

  const response = await listMyAvatars(httpClient)();

  if (isOk(response)) {
    avatars.value = response.data
      .filter((a) => a.avatarType === "normal" && !a.isPatronAvatar)
      .sort((a, b) => a.id - b.id);
  }
});
</script>
