import { atom } from "jotai";

export interface Topic {
  id: number;
  name: string;
  slug: string;
  subTopics: SubTopic[];
}

export interface SubTopic {
  id: number;
  name: string;
  slug: string;
  topicId: number;
}

export const allTopicsAtom = atom<Topic[]>([]);
export const selectedTopicIdsAtom = atom<number[]>([]);
export const selectedSubTopicIdsAtom = atom<number[]>([]);
