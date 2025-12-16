import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  Animated,
  Image,
} from "react-native";
import { IconButton } from "react-native-paper";
import api from "../api/api";
import PostCard from "../components/PostCard";
import NetInfo from "@react-native-community/netinfo";

export default function HomeScreen({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  const startShimmer = () => {
    shimmerAnim.setValue(-1);
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  };

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setNetworkError(false);
    try {
      const state = await NetInfo.fetch();
      if (!state.isConnected) {
        setNetworkError(true);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 2500);
        setLoading(false);
        return;
      }

      const res = await api.get("/posts");
      setPosts(res.data || []);
    } catch (err) {
      console.error("FETCH POSTS ERROR:", err.response?.data || err.message);
      setNetworkError(true);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 2500);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
    startShimmer();
  }, [fetchPosts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  // Skeleton Loader with Shimmer
  const renderSkeleton = () => {
    const translateX = shimmerAnim.interpolate({
      inputRange: [-1, 1],
      outputRange: [-300, 300],
    });

    return (
      <View style={styles.skeletonCard}>
        <Animated.View style={[styles.skeletonShimmer, { transform: [{ translateX }] }]} />
        <View style={styles.skeletonHeader} />
        <View style={styles.skeletonContent} />
        <View style={styles.skeletonMedia} />
      </View>
    );
  };

  // Network Error Message
  const renderNetworkError = () => (
    <View style={styles.networkError}>
      <Image
        source={{ uri: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" }}
        style={styles.networkIcon}
      />
      <Text style={styles.networkText}>
        Oops! Your connection seems wobbly. Check your internet or try again in a bit.
      </Text>
      <IconButton icon="refresh" size={28} onPress={fetchPosts} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 🔝 HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WeCare</Text>
        <Text style={styles.headerSubtitle}>We really care...</Text>
      </View>

      {/* 🚨 TOP NETWORK BANNER */}
      {showBanner && (
        <View style={styles.banner}>
          <Image
            source={{ uri: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" }}
            style={styles.bannerIcon}
          />
          <Text style={styles.bannerText}>Your connection is weak. Please check your internet.</Text>
        </View>
      )}

      {/* 📰 FEED */}
      {loading ? (
        <>
          {renderSkeleton()}
          {renderSkeleton()}
          {renderSkeleton()}
        </>
      ) : networkError ? (
        renderNetworkError()
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <PostCard post={item} onReact={fetchPosts} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ➕ FLOATING CREATE POST */}
      <View style={styles.fabWrapper}>
        <IconButton
          icon="plus"
          size={32}
          iconColor="#fff"
          style={styles.fab}
          onPress={() => navigation.navigate("CreatePost")}
        />
      </View>

      {/* 🔽 BOTTOM NAV */}
      <View style={styles.bottomNav}>
        <IconButton
          icon="home"
          size={30}
          iconColor={activeTab === "home" ? "#000" : "#444"}
          onPress={() => setActiveTab("home")}
        />
        <IconButton
          icon="magnify"
          size={30}
          iconColor={activeTab === "search" ? "#000" : "#444"}
          onPress={() => setActiveTab("search")}
        />
        <View style={{ width: 60 }} />
        <IconButton
          icon="bell"
          size={30}
          iconColor={activeTab === "notifications" ? "#000" : "#444"}
          onPress={() => setActiveTab("notifications")}
        />
        <IconButton
          icon="account"
          size={30}
          iconColor={activeTab === "profile" ? "#000" : "#444"}
          onPress={() => setActiveTab("profile")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F6F6" },
  header: { backgroundColor: "#F5A623", paddingTop: 50, paddingBottom: 8, paddingHorizontal: 16 }, // pushed slightly up
  headerTitle: { fontSize: 26, fontWeight: "bold", color: "#000", marginBottom: 2 },
  headerSubtitle: { fontSize: 14, fontStyle: "italic", color: "#333" },
  fabWrapper: { position: "absolute", bottom: 30, alignSelf: "center", zIndex: 10 },
  fab: { backgroundColor: "#000", borderRadius: 35, elevation: 6 },
  bottomNav: { position: "absolute", bottom: 0, height: 60, width: "100%", backgroundColor: "#F5A623", flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: 10 },

  // Skeleton Styles
  skeletonCard: { margin: 12, padding: 12, borderRadius: 16, backgroundColor: "#eee", overflow: "hidden" },
  skeletonShimmer: { position: "absolute", top: 0, left: 0, height: "100%", width: 200, backgroundColor: "rgba(255,255,255,0.4)", borderRadius: 16 },
  skeletonHeader: { width: 60, height: 20, backgroundColor: "#ddd", borderRadius: 10, marginBottom: 10 },
  skeletonContent: { width: "100%", height: 60, backgroundColor: "#ddd", borderRadius: 10, marginBottom: 10 },
  skeletonMedia: { width: "100%", height: 220, backgroundColor: "#ddd", borderRadius: 12 },

  // Network Error Styles
  networkError: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 30 },
  networkIcon: { width: 60, height: 60, marginBottom: 12 },
  networkText: { fontSize: 16, color: "#333", textAlign: "center", marginBottom: 12 },

  // Banner
  banner: { flexDirection: "row", backgroundColor: "#FFE4E1", padding: 10, alignItems: "center", justifyContent: "center" },
  bannerIcon: { width: 24, height: 24, marginRight: 8 },
  bannerText: { color: "#B00020", fontWeight: "bold", fontSize: 14 },
}); 