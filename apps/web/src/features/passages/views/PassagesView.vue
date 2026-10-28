<script setup lang="ts">
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="共途"
      title="一起走过的路，可以停泊"
      description="共途记录一段有始有终的共同经历，可以续程、停泊或归档；它不等于长期联系人。当前版本尚未开放创建共途。"
    />

    <div class="section-stack">
      <SectionCard title="我正在进行的共途" description="每一段共途都保留自己的进度与许可。">
        <EmptyState
          title="还没有正在进行的共途"
          description="当你与另一个人开始一段共同主题的通信，它会出现在这里。"
          hint="完成共途不会自动成为信友；信友需要双方另行同意。"
        />
      </SectionCard>

      <SectionCard title="待续程 / 已归档" description="停泊只阻止新的关系行为，不会删除已经发生过的记录。">
        <EmptyState
          title="暂无需要处理的共途"
          description="续程、停泊与归档会在这里以真实状态呈现。"
          hint="当前没有可操作的入口。"
        />
      </SectionCard>
    </div>
  </div>
</template>
