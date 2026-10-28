<script setup lang="ts">
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="发现"
      title="看看别人生活的城市"
      description="城市故事站与世界记忆地图共用同一批已审核故事。当前没有可展示的公开内容，也不会用示例故事填充页面。"
    />

    <div class="section-stack">
      <SectionCard title="城市故事站" description="经作者授权并通过审核的城市生活片段。">
        <EmptyState
          title="还没有已审核的城市故事"
          description="故事会先经过审核，再同时出现在故事站与地图的城市入口。"
          hint="你可以稍后回来，或者先去邮局写下自己的第一封信。"
        />
      </SectionCard>

      <SectionCard title="善意的接力" badge="暂未开放 · P1" description="不要求回信、不建立债务的弱连接。">
        <EmptyState
          title="这一功能还在计划中"
          description="未来它会允许你把一份善意交给陌生人，而不必等待回应。"
          hint="当前没有可点击的入口，也不会伪造接力内容。"
        />
      </SectionCard>

      <SectionCard title="世界记忆地图" description="按城市浏览同一批已审核故事；地图不产生独立内容。">
        <EmptyState
          title="地图入口尚未开放"
          description="地图只做城市级入口，不收集精确位置，也不展示未经审核的故事。"
          hint="地图渲染方案不在本阶段范围内。"
        />
      </SectionCard>
    </div>
  </div>
</template>
