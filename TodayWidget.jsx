import { Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import { PlatformColor } from 'react-native';

function TodayProgress({ done, total }) {
  'widget';
  return (
    <VStack spacing={8} modifiers={[containerBackground(PlatformColor('systemBackground'), 'widget')]}>
      <Text modifiers={[font({ weight: 'semibold', size: 15 })]}>Сегодня</Text>
      <Text modifiers={[font({ weight: 'bold', size: 34 })]}>{String(done) + ' / ' + String(total)}</Text>
      <Text>Дел выполнено</Text>
    </VStack>
  );
}

export default createWidget('TodayProgress', TodayProgress);