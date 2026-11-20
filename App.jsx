import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, Linking, Modal, Pressable, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, dateKey, noteDraftFromLink, periodRange, shiftPeriod, taskStats } from './planner.mjs';

const TodayWidget = process.env.EXPO_PUBLIC_RITM_SIDELOAD === '1' ? null : require('./TodayWidget').default;
const storageKey = 'ritm.v1';
const empty = { tasks: [], goals: [], notes: [] };
const tabs = { tasks: 'План', goals: 'Цели', notes: 'Заметки' };
const modes = { day: 'День', week: 'Неделя', month: 'Месяц' };
const names = { tasks: 'Дело', goals: 'Цель', notes: 'Заметка' };
const shortDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });
const fullDate = new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' });
const monthDate = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' });

function Button({ children, active, onPress, label }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.button, active && styles.active, pressed && styles.pressed]}>
      <Text style={[styles.buttonText, active && styles.activeText]}>{children}</Text>
    </Pressable>
  );
}

function Meter({ percent }) {
  return <View style={styles.track}><View style={[styles.fill, { width: percent + '%' }]} /></View>;
}

export default function App() {
  return <SafeAreaProvider><Planner /></SafeAreaProvider>;
}

function Planner() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('tasks');
  const [mode, setMode] = useState('day');
  const [date, setDate] = useState(() => new Date());
  const [today, setToday] = useState(() => new Date());
  const [draft, setDraft] = useState(null);
  const saving = useRef(false);

  async function load() {
    setError(false);
    try {
      const saved = await AsyncStorage.getItem(storageKey);
      setData(saved ? { ...empty, ...JSON.parse(saved) } : empty);
    } catch {
      setError(true);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const refresh = () => setToday((current) => {
      const now = new Date();
      return dateKey(now) === dateKey(current) ? current : now;
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(refresh, 60_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!data) return;
    function receive(url) {
      const text = noteDraftFromLink(url);
      if (!text) return;
      setTab('notes');
      setDraft({ type: 'notes', title: text });
    }
    const listener = Linking.addEventListener('url', ({ url }) => receive(url));
    void Linking.getInitialURL().then(receive).catch(() => {});
    return () => listener.remove();
  }, [data !== null]);

  useEffect(() => {
    if (!data || !TodayWidget) return;
    try {
      TodayWidget.updateTimeline(Array.from({ length: 8 }, (_, index) => {
        const day = addDays(today, index);
        const stats = taskStats(data.tasks, day, addDays(day, 1));
        return { date: index === 0 ? new Date() : day, props: { done: stats.done, total: stats.planned.length } };
      }));
    } catch (error) {
      console.warn('Не удалось обновить виджет Ритма', error);
    }
  }, [data?.tasks, today]);

  async function update(type, transform) {
    if (saving.current) return false;
    saving.current = true;
    try {
      const next = { ...data, [type]: transform(data[type]) };
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setData(next);
      return true;
    } catch {
      Alert.alert('Изменение не сохранено', 'Попробуй ещё раз.');
      return false;
    } finally {
      saving.current = false;
    }
  }

  function startDraft(item) {
    const initialDate = mode !== 'day' && dateKey(date) === dateKey(periodRange(today, mode)[0])
      ? today : date;
    setDraft({
      type: tab, title: '', target: '10', date: initialDate,
      ...item, ...(item?.date ? { date: new Date(item.date + 'T12:00:00') } : {}),
    });
  }

  async function saveDraft() {
    const title = draft.title.trim();
    if (!title) return;
    const target = Number(draft.target);
    if (draft.type === 'goals' && (!Number.isSafeInteger(target) || target < 1)) {
      Alert.alert('Укажи целое число больше нуля');
      return;
    }
    const entry = { id: draft.id ?? String(Date.now()), title };
    if (draft.type === 'tasks') Object.assign(entry, { date: dateKey(draft.date), done: draft.done ?? false });
    if (draft.type === 'goals') Object.assign(entry, { target, current: Math.min(draft.current ?? 0, target) });
    const saved = await update(draft.type, (items) => draft.id
      ? items.map((item) => item.id === draft.id ? entry : item)
      : [...items, entry]);
    if (saved) {
      if (draft.type === 'tasks') setDate(draft.date);
      setDraft(null);
    }
  }

  function deleteDraft() {
    Alert.alert('Удалить запись?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        if (await update(draft.type, (items) => items.filter((item) => item.id !== draft.id))) setDraft(null);
      } },
    ]);
  }

  const [start, end] = periodRange(date, mode);
  const stats = taskStats(data?.tasks ?? [], start, end);
  const period = mode === 'month' ? monthDate.format(date) : mode === 'week'
    ? shortDate.format(start) + ' — ' + shortDate.format(addDays(end, -1)) : fullDate.format(date);
  const items = tab === 'tasks' ? stats.planned.sort((a, b) => a.date.localeCompare(b.date)) : data?.[tab] ?? [];

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.brand}>Ритм</Text>
        {data && <Button active onPress={() => startDraft()} label={'Добавить: ' + names[tab]}>＋</Button>}
      </View>
      {error && <Button onPress={load}>Повторить загрузку</Button>}
      {!data && !error && <Text style={styles.muted}>Загрузка…</Text>}
      {data && <>
        <View style={styles.tabs}>
          {Object.entries(tabs).map(([key, title]) => <Button key={key} active={tab === key} onPress={() => setTab(key)}>{title}</Button>)}
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'tasks' && <>
            <View style={styles.row}>
              {Object.entries(modes).map(([key, title]) => <Button key={key} active={mode === key} onPress={() => setMode(key)}>{title}</Button>)}
            </View>
            <View style={styles.row}>
              <Button label="Предыдущий период" onPress={() => setDate(shiftPeriod(date, mode, -1))}>‹</Button>
              <Text style={styles.period}>{period}</Text>
              <Button label="Следующий период" onPress={() => setDate(shiftPeriod(date, mode, 1))}>›</Button>
            </View>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Выполнение плана</Text>
              <Text style={styles.score}>{stats.planned.length ? stats.percent + '%' : '—'}</Text>
              <Meter percent={stats.percent} />
              <Text style={styles.heroLabel}>{stats.done} из {stats.planned.length} дел выполнено</Text>
            </View>
          </>}
          {tab === 'goals' && <Text style={styles.heading}>{items.filter((goal) => goal.current === goal.target).length} из {items.length} целей достигнуто</Text>}
          {items.length === 0 && <Text style={styles.muted}>
            {{ tasks: 'На этот период пока ничего не запланировано.', goals: 'Добавь цель и укажи, сколько шагов нужно сделать.', notes: 'Здесь будут твои заметки.' }[tab]}
          </Text>}
          {items.map((item) => <View key={item.id} style={styles.card}>
            <View style={styles.row}>
              {tab === 'tasks' && <Pressable
                accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.title}
                hitSlop={10} onPress={() => update(tab, (entries) => entries.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}
                style={[styles.check, item.done && styles.active]}>
                <Text style={styles.activeText}>{item.done ? '✓' : ''}</Text>
              </Pressable>}
              <Pressable style={styles.item} onPress={() => startDraft(item)} accessibilityRole="button">
                <Text style={[styles.itemTitle, item.done && styles.completed]}>{item.title}</Text>
                {tab === 'tasks' && mode !== 'day' && <Text style={styles.muted}>{shortDate.format(new Date(item.date + 'T12:00:00'))}</Text>}
              </Pressable>
            </View>
            {tab === 'goals' && <>
              <Meter percent={item.current * 100 / item.target} />
              <View style={styles.row}>
                <Text style={styles.item}>{item.current} / {item.target}</Text>
                {[-1, 1].map((step) => <Button key={step} label={step < 0 ? 'Уменьшить прогресс' : 'Увеличить прогресс'}
                  onPress={() => update(tab, (entries) => entries.map((entry) => entry.id === item.id
                    ? { ...entry, current: Math.max(0, Math.min(entry.target, entry.current + step)) } : entry))}>
                  {step < 0 ? '−' : '+'}
                </Button>)}
              </View>
            </>}
          </View>)}
          {tab === 'tasks' && dateKey(date) !== dateKey(today) && <Button onPress={() => setDate(new Date())}>К сегодняшнему дню</Button>}
        </ScrollView>
      </>}
      <Modal visible={!!draft} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDraft(null)}>
        {draft && <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
            <View style={styles.row}>
              <Button onPress={() => setDraft(null)}>Закрыть</Button>
              <Text style={styles.period}>{names[draft.type]}</Text>
              <Button active onPress={saveDraft}>Сохранить</Button>
            </View>
            <TextInput accessibilityLabel={names[draft.type]} value={draft.title} placeholder={draft.type === 'notes' ? 'Текст заметки' : 'Название'}
              multiline={draft.type === 'notes'} maxLength={draft.type === 'notes' ? 4000 : 160}
              onChangeText={(title) => setDraft({ ...draft, title })}
              style={[styles.input, draft.type === 'notes' && styles.noteInput]} />
            {draft.type === 'tasks' && <View style={styles.row}>
              <Button label="Предыдущий день" onPress={() => setDraft({ ...draft, date: addDays(draft.date, -1) })}>‹</Button>
              <Text style={styles.period}>{fullDate.format(draft.date)}</Text>
              <Button label="Следующий день" onPress={() => setDraft({ ...draft, date: addDays(draft.date, 1) })}>›</Button>
            </View>}
            {draft.type === 'goals' && <>
              <Text style={styles.muted}>Сколько шагов нужно сделать</Text>
              <TextInput accessibilityLabel="Количество шагов" keyboardType="number-pad" value={String(draft.target)}
                onChangeText={(target) => setDraft({ ...draft, target })} style={styles.input} />
            </>}
            {draft.id && <Button onPress={deleteDraft}>Удалить</Button>}
          </ScrollView>
        </SafeAreaView>}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F3ED' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 12 },
  brand: { fontSize: 44, fontWeight: '800', letterSpacing: -2.5, color: '#192C25' },
  heading: { fontSize: 22, fontWeight: '700', color: '#192C25' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  period: { flex: 1, textAlign: 'center', color: '#192C25', fontSize: 16, fontWeight: '700' },
  button: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 15, backgroundColor: '#E5E9DF' },
  active: { backgroundColor: '#245744' },
  pressed: { opacity: 0.72 },
  buttonText: { color: '#245744', fontWeight: '700', fontSize: 15 },
  activeText: { color: '#FFFFFF', fontWeight: '700' },
  hero: { padding: 22, gap: 10, backgroundColor: '#20392F', borderRadius: 26 },
  heroLabel: { color: '#D7E6D8', fontSize: 15, fontWeight: '600' },
  score: { fontSize: 60, fontWeight: '800', color: '#FFFFFF', letterSpacing: -3 },
  track: { height: 7, borderRadius: 5, overflow: 'hidden', backgroundColor: '#B8C9B8' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: '#5D9963' },
  card: { gap: 12, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 16 },
  item: { flex: 1 },
  itemTitle: { color: '#192C25', fontSize: 17, fontWeight: '600' },
  completed: { textDecorationLine: 'line-through', color: '#576A60' },
  muted: { color: '#576A60', fontSize: 15 },
  check: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: '#799381', alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 52, backgroundColor: '#FFFFFF', padding: 14, borderRadius: 16, color: '#192C25', fontSize: 17 },
  noteInput: { minHeight: 180, textAlignVertical: 'top' },
});