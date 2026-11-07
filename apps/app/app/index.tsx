import { APP_NAME } from "@wallt/core";
import { Button, Text } from "@wallt/ui";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function Home() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text variant="heading">Hello, {APP_NAME}</Text>
      {__DEV__ ? (
        <Button
          label="Open UI gallery"
          variant="secondary"
          onPress={() => router.push("/dev/ui")}
        />
      ) : null}
    </View>
  );
}
