<script setup lang="ts">
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="纪念册"
      title="把共同的时间收好"
      description="双城日记、共同手帐与个人记忆有各自不同的可见范围。当前版本尚未开放纪念册内容。"
    />

    <div class="section-stack">
      <SectionCard title="双城日记" description="只由双方真实交换并且已经抵达的内容形成。">
        <EmptyState
          title="还没有双城日记"
          description="当你们之间出现第一封已抵达的信，这里才会开始记录。"
          hint="没有内容时不会生成示例日记。"
        />
      </SectionCard>

      <SectionCard title="共同手帐" badge="暂未开放 · P1" description="双方共同编辑的长期作品，需要额外授权。">
        <EmptyState
          title="共同手帐尚未开放"
          description="它会是一份独立的共享授权，不会因为参与共途而自动创建。"
        />
      </SectionCard>

      <SectionCard title="个人记忆" description="只归你个人查看，不会随个人资料公开。">
        <EmptyState
          title="还没有个人记忆"
          description="你可以把想留下的片段保存在这里，仅自己可见。"
          hint="当前还没有创建入口。"
        />
      </SectionCard>
    </div>
  </div>
</template>
