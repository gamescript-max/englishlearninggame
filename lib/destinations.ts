import { lessons, topics, type Lesson, type TopicId } from "./course";

export type DestinationId = TopicId | "bubbles" | "delivery" | "connections" | "stars";
export const destinations: { id: DestinationId; title: string; subtitle: string; color: string; topicId?: TopicId; order?: number }[] = [
  ...topics.map(topic => ({ id: topic.id, title: topic.title, subtitle: topic.subtitle, color: topic.color, topicId: topic.id })),
  { id: "bubbles", title: "泡泡海湾", subtitle: "听一听，收集双份泡泡宝藏", color: "#288bca", order: 11 },
  { id: "delivery", title: "快递码头", subtitle: "装满托盘，给乐乐送订单", color: "#d07a29", order: 12 },
  { id: "connections", title: "连线乐园", subtitle: "给词语和图片架一座桥", color: "#9864b8", order: 13 },
  { id: "stars", title: "星星草地", subtitle: "移动小篮子，接住英语小星星", color: "#cf9636", order: 14 },
];
export function destinationLessons(id: DestinationId): Lesson[] {
  const destination = destinations.find(item => item.id === id)!;
  return lessons.filter(lesson => destination.topicId ? lesson.topicId === destination.topicId : lesson.order === destination.order);
}
