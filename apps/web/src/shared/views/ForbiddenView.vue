<script setup lang="ts">
import PageHeader from '../ui/PageHeader.vue';
import SectionCard from '../ui/SectionCard.vue';
</script>

<template>
  <div class="page page-narrow">
    <PageHeader
      eyebrow="权限"
      title="这里不对外开放"
      description="这个页面只对具备审核权限的账号开放。普通浏览与写作不受影响。"
    />

    <SectionCard title="可以继续做的事" description="你仍然可以阅读已审核的城市故事，或写下自己的片段。">
      <div class="form-actions">
        <RouterLink class="button" :to="{ name: 'discover' }">回到城市故事站</RouterLink>
        <RouterLink class="button button-quiet" :to="{ name: 'post-office' }">回到邮局</RouterLink>
      </div>
    </SectionCard>
  </div>
</template>
