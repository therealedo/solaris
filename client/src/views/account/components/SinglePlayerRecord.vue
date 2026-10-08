<template>
  <template v-if="result && result.record.played > 0">
    <view-subtitle title="Single Player" class="mt-2" />
    <div class="row">
      <div class="col-sm-12 col-md-8 table-responsive">
        <table class="table table-striped table-hover">
          <thead>
            <tr>
              <th>Difficulty</th>
              <th class="text-end">Played</th>
              <th class="text-end">Won</th>
              <th class="text-end">Lost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.difficulty">
              <td>{{ capitalise(row.difficulty) }}</td>
              <td class="text-end">{{ row.played }}</td>
              <td class="text-end">{{ row.won }}</td>
              <td class="text-end">{{ row.lost }}</td>
            </tr>
            <tr>
              <td><strong>Total</strong></td>
              <td class="text-end">
                <strong>{{ result.record.played }}</strong>
              </td>
              <td class="text-end">
                <strong>{{ result.record.won }}</strong>
              </td>
              <td class="text-end">
                <strong>{{ result.record.lost }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="text-muted">
          Single player games don't count towards your rank. Suggested
          difficulty for your next game:
          <strong>{{ capitalise(result.suggestedDifficulty) }}</strong
          >.
        </p>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import ViewSubtitle from "../../components/ViewSubtitle.vue";
import { computed, inject, onMounted, ref, type Ref } from "vue";
import { formatError, httpInjectionKey, isOk } from "@/services/typedapi";
import { getSinglePlayerRecord } from "@/services/typedapi/user";
import {
  AI_DIFFICULTIES,
  type SinglePlayerRecordResponse,
} from "@solaris/common";

const httpClient = inject(httpInjectionKey)!;

const result: Ref<SinglePlayerRecordResponse | null> = ref(null);

// Only the difficulties the user has played, weakest first with classic last.
const rows = computed(() => {
  const record = result.value?.record;

  if (!record) {
    return [];
  }

  return [...AI_DIFFICULTIES.filter((d) => d !== "classic"), "classic" as const]
    .map((difficulty) => ({ difficulty, ...record.byDifficulty[difficulty] }))
    .filter((row) => row.played > 0);
});

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

onMounted(async () => {
  const response = await getSinglePlayerRecord(httpClient)();

  if (isOk(response)) {
    result.value = response.data;
  } else {
    console.error(formatError(response));
  }
});
</script>
