import ExpoModulesCore
import CoreLocation

public class ExpoMapboxNavigationModule: Module {

  public func definition() -> ModuleDefinition {
    Name("ExpoMapboxNavigation")

    View(ExpoMapboxNavigationView.self) {
      Events(
        "onRouteProgressChanged",
        "onCancelNavigation",
        "onWaypointArrival",
        "onFinalDestinationArrival",
        "onRouteChanged",
        "onUserOffRoute",
        "onRoutesLoaded",
        "onRouteFailedToLoad"
      )

      Prop("coordinates") { (view: ExpoMapboxNavigationView, coordinates: [[String: Any]]) in
        var points: [CLLocationCoordinate2D] = []
        for coordinate in coordinates {
          if let lat = coordinate["latitude"] as? Double,
             let lng = coordinate["longitude"] as? Double {
            points.append(CLLocationCoordinate2D(latitude: lat, longitude: lng))
          }
        }
        view.controller.setCoordinates(coordinates: points)
      }

      Prop("waypointIndices") { (view: ExpoMapboxNavigationView, indices: [Int]?) in
        view.controller.setWaypointIndices(waypointIndices: indices)
      }

      Prop("useRouteMatchingApi") { (view: ExpoMapboxNavigationView, value: Bool?) in
        view.controller.setIsUsingRouteMatchingApi(useRouteMatchingApi: value)
      }

      Prop("directionsJson") { (view: ExpoMapboxNavigationView, value: String?) in
        view.controller.setDirectionsJson(jsonString: value)
      }

      Prop("mute") { (view: ExpoMapboxNavigationView, isMuted: Bool?) in
        view.controller.setIsMuted(isMuted: isMuted)
      }

      // No-op props kept for JS compat with the v3 surface.
      Prop("vehicleMaxHeight") { (view: ExpoMapboxNavigationView, v: Double?) in
        view.controller.setVehicleMaxHeight(maxHeight: v)
      }
      Prop("vehicleMaxWidth") { (view: ExpoMapboxNavigationView, v: Double?) in
        view.controller.setVehicleMaxWidth(maxWidth: v)
      }
      Prop("locale") { (view: ExpoMapboxNavigationView, v: String?) in
        view.controller.setLocale(locale: v)
      }
      Prop("routeProfile") { (view: ExpoMapboxNavigationView, v: String?) in
        view.controller.setRouteProfile(profile: v)
      }
      Prop("routeExcludeList") { (view: ExpoMapboxNavigationView, v: [String]?) in
        view.controller.setRouteExcludeList(excludeList: v)
      }
      Prop("mapStyle") { (view: ExpoMapboxNavigationView, v: String?) in
        view.controller.setMapStyle(style: v)
      }
      Prop("customRasterSourceUrl") { (view: ExpoMapboxNavigationView, v: String?) in
        view.controller.setCustomRasterSourceUrl(url: v)
      }
      Prop("placeCustomRasterLayerAbove") { (view: ExpoMapboxNavigationView, v: String?) in
        view.controller.setPlaceCustomRasterLayerAbove(layerId: v)
      }
      Prop("disableAlternativeRoutes") { (view: ExpoMapboxNavigationView, v: Bool?) in
        view.controller.setDisableAlternativeRoutes(disableAlternativeRoutes: v)
      }
      Prop("followingZoom") { (view: ExpoMapboxNavigationView, v: Double?) in
        view.controller.setFollowingZoom(followingZoom: v)
      }
      Prop("initialLocation") { (view: ExpoMapboxNavigationView, location: [String: Any]?) in
        if let location = location,
           let lat = location["latitude"] as? Double,
           let lng = location["longitude"] as? Double {
          let zoom = location["zoom"] as? Double
          view.controller.setInitialLocation(
            location: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            zoom: zoom
          )
        }
      }

      AsyncFunction("recenterMap") { (view: ExpoMapboxNavigationView) in
        view.controller.recenterMap()
      }
    }
  }
}
